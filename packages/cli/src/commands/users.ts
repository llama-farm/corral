import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { success, info, error as logError, jsonOutput, table } from '../util.js';

export async function usersListCommand(opts: { json?: boolean; config: string }) {
  // In real implementation, query database
  const mockUsers = [
    { name: 'Admin', email: 'admin@local', plan: 'admin', created: '2024-01-01', last_active: 'now' },
  ];

  if (opts.json) {
    jsonOutput(mockUsers, true);
    return;
  }

  info('Users (mock data — no DB connection):');
  table(mockUsers);
}

export async function usersCreateCommand(opts: {
  json?: boolean; config: string;
  email: string; password: string; name?: string;
}) {
  const user = { email: opts.email, name: opts.name || '', plan: 'free', created: new Date().toISOString() };

  if (opts.json) {
    jsonOutput(user, true);
    return;
  }

  success(`Created user: ${chalk.cyan(user.email)} (${user.name || 'no name'})`);
  info('Note: No DB connection — this is a dry run');
}

export async function usersSetPlanCommand(opts: {
  json?: boolean; config: string;
  email: string; plan: string;
}) {
  let config;
  try {
    config = loadConfig(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const plans = config.billing?.plans || {};
  if (!plans[opts.plan] && opts.plan !== 'free') {
    logError(`Unknown plan: ${opts.plan}. Available: ${Object.keys(plans).join(', ')}`);
    return;
  }

  if (opts.json) {
    jsonOutput({ email: opts.email, plan: opts.plan, updated: true }, true);
    return;
  }

  success(`Set ${chalk.cyan(opts.email)} → plan:${chalk.yellow(opts.plan)}`);
  info('Note: No DB connection — this is a dry run');
}
