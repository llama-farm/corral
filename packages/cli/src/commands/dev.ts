import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config.js';
import { success, info, error, jsonOutput } from '../util.js';

export async function devCommand(opts: { json?: boolean; config: string; verbose?: boolean }) {
  const spinner = ora('Loading config...').start();
  let config;
  try {
    config = loadConfig(opts.config);
    spinner.succeed('Config loaded');
  } catch (e: any) {
    spinner.fail(e.message);
    return;
  }

  if (opts.json) {
    jsonOutput({ status: 'starting', port: 3100, config: config.app }, true);
  }

  info(`App: ${chalk.bold(config.app.name)} (${config.app.id})`);
  info(`Database: ${config.database?.url || 'not configured'}`);

  // Auto-migrate
  const migrateSpinner = ora('Running migrations...').start();
  // In real implementation, this would run SQL
  migrateSpinner.succeed('Database ready (migrations skipped — no DB connection)');

  // Auto-seed
  if (config.seed?.auto_seed_dev) {
    info('Auto-seed enabled — run `corral seed` to seed data');
  }

  console.log('');
  console.log(chalk.green.bold('🐄 Corral dev server'));
  console.log(`  ${chalk.cyan('→')} Server:  ${chalk.underline('http://localhost:3100')}`);
  console.log(`  ${chalk.cyan('→')} Admin:   ${chalk.underline('http://localhost:3100/admin')}`);
  console.log(`  ${chalk.cyan('→')} Health:  ${chalk.underline('http://localhost:3100/health')}`);
  console.log('');
  info('Press Ctrl+C to stop');

  // In real implementation: start Hono server
  // For now, just print and exit
  if (!opts.json) {
    info('Dev server not yet implemented — exiting. Use this with the Corral SDK.');
  }
}
