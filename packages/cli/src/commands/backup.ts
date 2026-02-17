import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { success, info, error as logError, jsonOutput } from '../util.js';

const BACKUP_DIR = 'backups';

export async function backupNowCommand(opts: { json?: boolean; config: string }) {
  let config;
  try {
    config = loadConfig(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const dbUrl = config.database?.url;
  if (!dbUrl) {
    logError('No database URL configured');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.sql`;
  const filepath = join(BACKUP_DIR, filename);

  try {
    execSync(`pg_dump "${dbUrl}" > "${filepath}"`, { stdio: 'pipe' });
    if (opts.json) { jsonOutput({ file: filepath, timestamp }, true); return; }
    success(`Backup saved: ${chalk.cyan(filepath)}`);
  } catch (e: any) {
    if (opts.json) { jsonOutput({ error: 'pg_dump failed' }, true); return; }
    logError(`pg_dump failed: ${e.message}`);
    info('Make sure PostgreSQL is running and pg_dump is installed');
  }
}

export async function backupListCommand(opts: { json?: boolean }) {
  if (!existsSync(BACKUP_DIR)) {
    if (opts.json) { jsonOutput([], true); return; }
    info('No backups found');
    return;
  }

  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql')).sort().reverse();

  if (opts.json) { jsonOutput(files, true); return; }

  if (files.length === 0) {
    info('No backups found');
  } else {
    info(`${files.length} backup(s):`);
    for (const f of files) console.log(`  ${chalk.cyan(f)}`);
  }
}

export async function backupRestoreCommand(opts: { json?: boolean; config: string; from: string }) {
  let config;
  try {
    config = loadConfig(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const dbUrl = config.database?.url;
  if (!dbUrl) { logError('No database URL configured'); return; }

  if (!existsSync(opts.from)) {
    logError(`File not found: ${opts.from}`);
    return;
  }

  try {
    execSync(`psql "${dbUrl}" < "${opts.from}"`, { stdio: 'pipe' });
    if (opts.json) { jsonOutput({ restored: opts.from }, true); return; }
    success(`Restored from ${chalk.cyan(opts.from)}`);
  } catch (e: any) {
    if (opts.json) { jsonOutput({ error: 'restore failed' }, true); return; }
    logError(`Restore failed: ${e.message}`);
  }
}
