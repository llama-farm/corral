import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { success, info, error as logError, warn, jsonOutput } from '../util.js';

export async function stripeSyncCommand(opts: { json?: boolean; config: string; dryRun?: boolean }) {
  let config;
  try {
    config = loadConfig(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const stripeKey = process.env[config.billing?.stripe_secret_key_env || 'STRIPE_SECRET_KEY'];
  if (!stripeKey && !opts.dryRun) {
    logError('STRIPE_SECRET_KEY not set. Use --dry-run to preview.');
    return;
  }

  const plans = config.billing?.plans || {};
  const meters = config.meters || {};
  const actions: { type: string; name: string; action: string }[] = [];

  for (const [key, plan] of Object.entries(plans)) {
    const action = plan.stripe_price_id ? 'update' : 'create';
    actions.push({ type: 'plan', name: `${key} (${plan.name})`, action });
  }

  for (const [key, meter] of Object.entries(meters)) {
    const action = meter.stripe_meter_id ? 'update' : 'create';
    actions.push({ type: 'meter', name: `${key} (${meter.name})`, action });
  }

  if (opts.json) {
    jsonOutput({ dryRun: !!opts.dryRun, actions }, true);
    return;
  }

  if (opts.dryRun) {
    info(chalk.yellow('DRY RUN — no changes will be made'));
  }

  for (const a of actions) {
    const icon = a.action === 'create' ? chalk.green('+') : chalk.blue('~');
    console.log(`  ${icon} ${a.type}: ${a.name} → ${a.action}`);
  }

  if (!opts.dryRun) {
    warn('Stripe API calls not yet implemented — install stripe package');
  }

  console.log('');
  info(`${actions.length} action(s) ${opts.dryRun ? 'planned' : 'completed'}`);
}
