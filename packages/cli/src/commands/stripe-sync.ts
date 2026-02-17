import ora from 'ora';
import chalk from 'chalk';
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

  let Stripe: any;
  try {
    const { createRequire } = await import('module');
    const req = createRequire(process.cwd() + '/package.json');
    Stripe = req('stripe');
  } catch {
    try {
      Stripe = (await import('stripe')).default;
    } catch {
      logError('stripe package not installed. Run: npm install stripe');
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
        const displayName = plan.display_name || plan.name;
        if (product.name !== displayName) {
          const updated = await stripe.products.update(product.id, { name: displayName });
          product = updated;
        }
        if (spinner) spinner.text = `Found product: ${product.id}`;
      } else {
        product = await stripe.products.create({
          name: plan.display_name || plan.name,
          metadata: { corral_plan_id: key },
        });
        if (spinner) spinner.text = `Created product: ${product.id}`;
      }

      // 2. Find or create price
      const amountCents = Math.round(plan.price * 100);
      const interval = 'month'; // Default to monthly

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

      // Search for matching active price
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
        spinner?.succeed(`${key}: created price ${priceId}`);
        results.push({ plan: key, action: 'created', priceId });
      }

      // 3. Write back to config (support both array and record format)
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

  // Save updated config
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
