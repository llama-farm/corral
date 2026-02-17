import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { seedCommand } from './commands/seed.js';
import { configValidateCommand, configEditCommand, configSetCommand, configDiffCommand } from './commands/config.js';
import { stripeSyncCommand } from './commands/stripe.js';
import { stripeSyncCommand as stripeRealSyncCommand } from './commands/stripe-sync.js';
import { verifyCommand } from './commands/verify.js';
import { usersListCommand, usersCreateCommand, usersSetPlanCommand } from './commands/users.js';
import { statusCommand } from './commands/status.js';
import { llmsTxtCommand } from './commands/llms-txt.js';
import { backupNowCommand, backupListCommand, backupRestoreCommand } from './commands/backup.js';
import { testCommand } from './commands/test.js';
import { doctorCommand } from './commands/doctor.js';
import { analyzeCommand } from './commands/analyze.js';
import { validateCommand } from './commands/validate.js';
import { rollbackCommandHandler } from './commands/rollback.js';
import { addCommand } from './commands/add.js';
import { deployCommand } from './commands/deploy.js';

const program = new Command();

program
  .name('corral')
  .description('🐄 Corral — Embedded auth + billing SDK')
  .version('0.4.1')
  .option('--json', 'Output as JSON')
  .option('--config <path>', 'Config file path', 'corral.yaml')
  .option('--verbose', 'Verbose output');

function opts() {
  return program.opts() as { json?: boolean; config: string; verbose?: boolean };
}

program.command('init')
  .description('Initialize Corral in the current project')
  .option('--db <type>', 'Database type: sqlite, pg, mysql', 'sqlite')
  .option('--server <framework>', 'Auth server framework for SPAs: express, hono, fastify')
  .option('--no-install', 'Skip dependency installation')
  .option('--analyze', 'Scan and report the project before making any changes (same as corral analyze)')
  .action((cmdOpts) => {
    if (cmdOpts.analyze) {
      return analyzeCommand({ json: opts().json });
    }
    return initCommand({ ...opts(), ...cmdOpts });
  });

const deployCmd = program.command('deploy').description('Generate deployment templates');

deployCmd.command('docker')
  .description('Generate Dockerfile + docker-compose.yml + nginx.conf + supervisord.conf')
  .action(() => deployCommand('docker'));

deployCmd.command('fly')
  .description('Generate fly.toml + Dockerfile')
  .option('--region <region>', 'Fly region (default: iad)', 'iad')
  .action((cmdOpts) => deployCommand('fly', cmdOpts));

deployCmd.command('railway')
  .description('Generate railway.json + Dockerfile')
  .action(() => deployCommand('railway'));

deployCmd.command('render')
  .description('Generate render.yaml + Dockerfile')
  .action(() => deployCommand('render'));

program.command('dev')
  .description('Start the Corral dev server')
  .action(() => devCommand(opts()));

program.command('seed')
  .description('Seed the database with test data')
  .option('--admin-only', 'Only create admin user')
  .option('--sample-data', 'Include sample data')
  .option('--reset', 'Wipe existing data first')
  .action((cmdOpts) => seedCommand({ ...opts(), ...cmdOpts }));

// Config subcommand
const configCmd = program.command('config').description('Manage corral.yaml configuration');

configCmd.command('validate')
  .description('Validate corral.yaml')
  .action(() => configValidateCommand(opts()));

configCmd.command('edit')
  .description('Open corral.yaml in editor')
  .action(() => configEditCommand(opts()));

configCmd.command('set')
  .description('Set a config value (dot-notation)')
  .argument('<key>', 'Config key (e.g. billing.plans.pro.price)')
  .argument('<value>', 'Value to set')
  .action((key, value) => configSetCommand(key, value, opts()));

configCmd.command('diff')
  .description('Show config differences from deployed state')
  .action(() => configDiffCommand(opts()));

// Stripe subcommand
const stripeCmd = program.command('stripe').description('Stripe integration');

stripeCmd.command('sync')
  .description('Sync plans and meters to Stripe (dry-run preview)')
  .option('--dry-run', 'Preview changes without applying')
  .action((cmdOpts) => stripeSyncCommand({ ...opts(), ...cmdOpts }));

stripeCmd.command('push')
  .description('Create/update Stripe products and prices via API')
  .option('--key <key>', 'Stripe secret key (overrides env)')
  .action((cmdOpts) => stripeRealSyncCommand({ ...opts(), ...cmdOpts }));

// Users subcommand
const usersCmd = program.command('users').description('User management');

usersCmd.command('list')
  .description('List all users')
  .action(() => usersListCommand(opts()));

usersCmd.command('create')
  .description('Create a new user')
  .requiredOption('--email <email>', 'User email')
  .requiredOption('--password <pass>', 'User password')
  .option('--name <name>', 'User name')
  .action((cmdOpts) => usersCreateCommand({ ...opts(), ...cmdOpts }));

usersCmd.command('set-plan')
  .description('Set a user\'s plan')
  .requiredOption('--email <email>', 'User email')
  .requiredOption('--plan <plan>', 'Plan name')
  .action((cmdOpts) => usersSetPlanCommand({ ...opts(), ...cmdOpts }));

// Add subcommands
program.addCommand(addCommand);

// Analyze — scan the current project before init
program.command('analyze')
  .description('Scan the current project and report what Corral will find (run before corral init)')
  .action(() => analyzeCommand({ json: opts().json }));

// Validate — runtime checks after init
program.command('validate')
  .description('Comprehensive runtime check that everything is wired correctly after init')
  .option('--url <url>', 'Base URL to test against (default: BETTER_AUTH_URL or http://localhost:3000)')
  .option('--fix', 'Auto-fix issues where possible')
  .action((cmdOpts) => validateCommand({ ...opts(), ...cmdOpts }));

// Rollback — undo the last corral init or corral add
program.command('rollback')
  .description('Undo the last corral init or corral add operation')
  .argument('[timestamp]', 'Roll back to a specific snapshot (see --list)')
  .option('--list', 'Show available rollback points')
  .option('--dry-run', 'Preview what would be changed without touching files')
  .action((timestamp, cmdOpts) =>
    rollbackCommandHandler({ ...opts(), ...cmdOpts, timestamp }));

// Doctor
program.command('doctor')
  .description('Pre-flight checks: config, env vars, database, Stripe, route conflicts')
  .option('--url <url>', 'Base URL to test against')
  .action((cmdOpts) => doctorCommand({ ...opts(), ...cmdOpts }));

// Test
program.command('test')
  .description('Run end-to-end auth smoke tests (sign up → sign in → session → sign out)')
  .option('--url <url>', 'Base URL of the app (default: BETTER_AUTH_URL or http://localhost:3000)')
  .option('--email <email>', 'Test user email (default: auto-generated)')
  .option('--password <password>', 'Test user password (default: CorralTest123!)')
  .option('--name <name>', 'Test user name (default: Corral Test User)')
  .option('--cleanup', 'Delete test user after tests')
  .action((cmdOpts) => testCommand({ ...opts(), ...cmdOpts }));

// Verify
program.command('verify')
  .description('End-to-end verification of all auth endpoints')
  .option('--url <url>', 'Base URL of the app (default: BETTER_AUTH_URL or http://localhost:3000)')
  .action((cmdOpts) => verifyCommand({ ...opts(), ...cmdOpts }));

// Status
program.command('status')
  .description('Show current project status — users, plans, MRR, Stripe, auth health')
  .option('--url <url>', 'Base URL to check auth health against')
  .action((cmdOpts) => statusCommand({ ...opts(), ...cmdOpts }));

// llms-txt
program.command('llms-txt')
  .description('Generate llms.txt for AI agent discovery of auth/billing APIs')
  .option('--output <path>', 'Write to file (e.g. .well-known/llms.txt)')
  .option('--serve', 'Serve llms.txt locally for testing')
  .option('--full', 'Output the extended llms-full.txt variant (curl examples + schemas)')
  .option('--port <port>', 'Port for --serve mode (default: 7331)', (v) => parseInt(v, 10))
  .action((cmdOpts) => llmsTxtCommand({ ...opts(), ...cmdOpts }));

// Backup subcommand
const backupCmd = program.command('backup').description('Database backups');

backupCmd.command('now')
  .description('Create a backup')
  .action(() => backupNowCommand(opts()));

backupCmd.command('list')
  .description('List backups')
  .action(() => backupListCommand({ json: opts().json }));

backupCmd.command('restore')
  .description('Restore from backup')
  .requiredOption('--from <file>', 'Backup file to restore')
  .action((cmdOpts) => backupRestoreCommand({ ...opts(), ...cmdOpts }));

program.parse();
