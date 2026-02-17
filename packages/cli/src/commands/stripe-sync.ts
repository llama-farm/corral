import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { loadConfig, loadConfigRaw, saveConfig } from '../config.js';
import { success, info, error as logError, warn, jsonOutput } from '../util.js';

export async function stripeSyncCommand(opts: { json?: boolean; config: string; key?: string }) {
  let config;
  let rawConfig: Record<string, any>;
  try {
    config = loadConfig(opts.config);
    rawConfig = loadConfigRaw(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const stripeKey = opts.key || process.env[config.billing?.stripe_secret_key_env || 'STRIPE_SECRET_KEY'];
  if (!stripeKey) {
    logError('Stripe secret key not found. Pass --key or set STRIPE_SECRET_KEY.');
    return;
  }

  // Load Stripe — try project-local install first (via createRequire), then ESM import.
  // If missing, auto-install and retry.
  let Stripe: any;
  async function tryLoadStripe(): Promise<any | null> {
    try {
      const { createRequire } = await import('module');
      const req = createRequire(process.cwd() + '/package.json');
      return req('stripe');
    } catch {
      try {
        return (await import('stripe')).default;
      } catch {
        return null;
      }
    }
  }

  Stripe = await tryLoadStripe();
  if (!Stripe) {
    if (!opts.json) info('stripe package not found — installing...');
    try {
      execSync('npm install stripe', { stdio: opts.json ? 'pipe' : 'inherit' });
      if (!opts.json) success('Installed stripe');
      Stripe = await tryLoadStripe();
    } catch {
      // ignore install error
    }
    if (!Stripe) {
      logError('Failed to load stripe. Run: npm install stripe');
      return;
    }
  }

  const stripe = Stripe(stripeKey);

  // Support both top-level plans array and billing.plans record
  let plans: Record<string, any> = {};
  if (Array.isArray(rawConfig.plans)) {
    for (const p of rawConfig.plans) {
      if (p.name) plans[p.name] = p;
    }
  } else if (config.billing?.plans && typeof config.billing.plans === 'object') {
    plans = config.billing.plans;
  } else if (rawConfig.billing?.plans && typeof rawConfig.billing.plans === 'object') {
    plans = rawConfig.billing.plans;
  }

  const results: { plan: string; action: string; priceId: string }[] = [];

  if (!opts.json) {
    console.log(chalk.bold('\n🔄 Syncing plans to Stripe...\n'));
  }

  for (const [key, plan] of Object.entries(plans)) {
    if (!plan.price || plan.price <= 0) {
      if (!opts.json) info(`Skipping ${key} (free plan)`);
      continue;
    }

    const displayName = plan.display_name || (key.charAt(0).toUpperCase() + key.slice(1));
    const price = plan.price as number;
    const trialDays = plan.trial_days as number | undefined;
    const interval = plan.interval || 'month';

    const trialStr = trialDays ? `, ${trialDays}-day trial` : '';
    const humanLabel = `${displayName} ($${price}/mo${trialStr})`;

    const spinner = opts.json ? null : ora(`Syncing ${key}...`).start();

    try {
      // 1. Find or create product by metadata
      let product: { id: string; name?: string; [k: string]: any };
      const existingProducts = await stripe.products.search({
        query: `metadata["corral_plan_id"]:"${key}"`,
      });

      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        // Update name if changed
        if (product.name !== displayName) {
          product = await stripe.products.update(product.id, {
            name: displayName,
            metadata: {
              corral_plan_id: key,
              ...(trialDays ? { trial_days: String(trialDays) } : {}),
            },
          });
        }
        if (spinner) spinner.text = `Found product: ${product.id}`;
      } else {
        if (spinner) spinner.text = `Creating Stripe product: ${humanLabel}`;
        product = await stripe.products.create({
          name: displayName,
          metadata: {
            corral_plan_id: key,
            ...(trialDays ? { trial_days: String(trialDays) } : {}),
          },
        });
        if (!opts.json) info(`Creating Stripe product: ${humanLabel}`);
        if (spinner) spinner.text = `Created product: ${product.id}`;
      }

      // 2. Find or create price
      const amountCents = Math.round(price * 100);

      let priceId: string = plan.stripe_price_id || '';
      if (priceId) {
        // Verify existing price is still valid
        try {
          const existing = await stripe.prices.retrieve(priceId);
          if (existing.unit_amount === amountCents && existing.active) {
            spinner?.succeed(`${key}: price ${priceId} already synced`);
            results.push({ plan: key, action: 'unchanged', priceId });
            continue;
          }
        } catch {
          // Price doesn't exist, create new one
        }
      }

      // Search for matching active price on this product
      const existingPrices = await stripe.prices.list({
        product: product.id!,
        active: true,
        limit: 100,
      });

      const matchingPrice = existingPrices.data.find(
        (p: any) => p.unit_amount === amountCents && p.recurring?.interval === interval
      );

      if (matchingPrice) {
        priceId = matchingPrice.id;
        spinner?.succeed(`${key}: found existing price ${priceId}`);
        results.push({ plan: key, action: 'found', priceId });
      } else {
        const newPrice = await stripe.prices.create({
          product: product.id!,
          unit_amount: amountCents,
          currency: 'usd',
          recurring: { interval },
        });
        priceId = newPrice.id;
        spinner?.succeed(chalk.green(`${key}: created price ${priceId}`));
        results.push({ plan: key, action: 'created', priceId });
      }

      // 3. Write back stripe_price_id to config (support both array and record format)
      if (Array.isArray(rawConfig.plans)) {
        const planEntry = rawConfig.plans.find((p: any) => p.name === key);
        if (planEntry) planEntry.stripe_price_id = priceId;
      } else {
        if (!rawConfig.billing) rawConfig.billing = {};
        if (!rawConfig.billing.plans) rawConfig.billing.plans = {};
        if (!rawConfig.billing.plans[key]) rawConfig.billing.plans[key] = {};
        rawConfig.billing.plans[key].stripe_price_id = priceId;
      }

    } catch (e: any) {
      spinner?.fail(`${key}: ${e.message}`);
      results.push({ plan: key, action: 'error', priceId: e.message });
    }
  }

  // Save updated config with written-back price IDs
  try {
    saveConfig(opts.config, rawConfig);
    if (!opts.json) success('Updated corral.yaml with Stripe price IDs');
  } catch (e: any) {
    logError(`Failed to save config: ${e.message}`);
  }

  if (opts.json) {
    jsonOutput({ results }, true);
    return;
  }

  console.log('');
  info(`${results.length} plan(s) processed`);
}
