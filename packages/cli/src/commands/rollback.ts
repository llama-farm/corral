/**
 * corral rollback
 *
 * Undoes the last `corral init` or `corral add` operation by restoring files
 * from the backup manifest saved to `.corral/backups/<timestamp>/manifest.json`.
 *
 * How it works:
 *   - Before any file operation, `corral init` / `corral add` call createBackup()
 *     from utils/backup.ts and snapshot every file they're about to touch.
 *   - Each snapshot is saved to `.corral/backups/<timestamp>/manifest.json`
 *   - `corral rollback` reads the latest manifest and reverses the changes:
 *       'created'  → file is deleted
 *       'modified' → file is restored to its originalContent snapshot
 *
 * Usage:
 *   corral rollback                  # undo the most recent operation
 *   corral rollback --list           # show available rollback points
 *   corral rollback <timestamp>      # roll back to a specific snapshot
 *   corral rollback --json           # machine-readable output
 */

import { existsSync, unlinkSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import { listBackups, loadBackup } from '../utils/backup.js';
import { jsonOutput, success, error as logError, info, warn } from '../util.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a timestamp string for human-readable display. */
function formatTimestamp(ts: string): string {
  // Timestamp format: 2025-01-15T12-30-45-123Z → readable
  try {
    const iso = ts.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d+)Z/, 'T$1:$2:$3.$4Z');
    return new Date(iso).toLocaleString();
  } catch {
    return ts;
  }
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

/** corral rollback --list */
function listCommand(opts: { json?: boolean }) {
  const manifests = listBackups();

  if (manifests.length === 0) {
    if (opts.json) { jsonOutput([], true); return; }
    info('No rollback points found. Have you run corral init yet?');
    return;
  }

  if (jsonOutput(manifests.map(m => ({
    timestamp: m.timestamp,
    command: m.command,
    files: m.files.length,
    readable: formatTimestamp(m.timestamp),
  })), !!opts.json)) return;

  console.log(chalk.bold('\n📦 Available rollback points:\n'));
  for (const m of manifests) {
    const fileWord = m.files.length === 1 ? 'file' : 'files';
    console.log(
      `  ${chalk.cyan(m.timestamp)}\n` +
      `    ${chalk.dim('Command:')} ${m.command}\n` +
      `    ${chalk.dim('Date:')}    ${formatTimestamp(m.timestamp)}\n` +
      `    ${chalk.dim('Files:')}   ${m.files.length} ${fileWord} tracked\n`,
    );
  }
  console.log(chalk.dim(`  Run: corral rollback <timestamp>  to restore a specific point`));
  console.log('');
}

/** corral rollback [timestamp] */
function rollbackCommand(timestamp: string | undefined, opts: { json?: boolean; dryRun?: boolean }) {
  // Load manifest
  let manifest = timestamp ? loadBackup(timestamp) : null;

  if (!timestamp) {
    // No timestamp given — use the most recent backup
    const all = listBackups();
    if (all.length === 0) {
      logError('No rollback points found. Have you run corral init yet?');
      if (opts.json) jsonOutput({ error: 'no rollback points found' }, true);
      return;
    }
    manifest = all[0];
    console.log(chalk.bold(`\n⏪ Rolling back: ${chalk.cyan(manifest.command)}\n`));
    console.log(`   ${chalk.dim('Snapshot:')} ${formatTimestamp(manifest.timestamp)}\n`);
  } else {
    if (!manifest) {
      logError(`Rollback point not found: ${timestamp}`);
      logError(`Run: corral rollback --list  to see available points`);
      if (opts.json) jsonOutput({ error: `rollback point not found: ${timestamp}` }, true);
      return;
    }
    console.log(chalk.bold(`\n⏪ Rolling back to: ${chalk.cyan(timestamp)}\n`));
    console.log(`   ${chalk.dim('Command:')} ${manifest.command}`);
    console.log(`   ${chalk.dim('Date:')}    ${formatTimestamp(manifest.timestamp)}\n`);
  }

  if (!manifest) return; // TypeScript narrowing

  const results: Array<{ path: string; action: string; status: 'ok' | 'skipped' | 'error'; detail?: string }> = [];

  // Process files in reverse order (undo last writes first)
  const files = [...manifest.files].reverse();

  for (const file of files) {
    if (file.action === 'modified') {
      // ── Restore original content ──────────────────────────────────
      if (file.originalContent === undefined) {
        // Was marked modified but no snapshot — skip with warning
        warn(`  Skipping ${file.path} — no original content saved`);
        results.push({ path: file.path, action: 'restore', status: 'skipped', detail: 'no snapshot' });
        continue;
      }

      if (!opts.dryRun) {
        try {
          writeFileSync(file.path, file.originalContent, 'utf-8');
          success(`  Restoring ${file.path}...`);
          results.push({ path: file.path, action: 'restore', status: 'ok' });
        } catch (e: any) {
          logError(`  Failed to restore ${file.path}: ${e.message}`);
          results.push({ path: file.path, action: 'restore', status: 'error', detail: e.message });
        }
      } else {
        console.log(`  ${chalk.dim('[dry-run]')} Would restore: ${file.path}`);
        results.push({ path: file.path, action: 'restore', status: 'ok' });
      }

    } else if (file.action === 'created') {
      // ── Delete created file ───────────────────────────────────────
      if (!existsSync(file.path)) {
        info(`  ${file.path} already gone — skipping`);
        results.push({ path: file.path, action: 'delete', status: 'skipped', detail: 'already removed' });
        continue;
      }

      if (!opts.dryRun) {
        try {
          unlinkSync(file.path);
          success(`  Deleting ${file.path}...`);
          results.push({ path: file.path, action: 'delete', status: 'ok' });
        } catch (e: any) {
          logError(`  Failed to delete ${file.path}: ${e.message}`);
          results.push({ path: file.path, action: 'delete', status: 'error', detail: e.message });
        }
      } else {
        console.log(`  ${chalk.dim('[dry-run]')} Would delete: ${file.path}`);
        results.push({ path: file.path, action: 'delete', status: 'ok' });
      }
    }
  }

  // ─── Summary ────────────────────────────────────────────────────────

  const succeeded = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log('');
  if (opts.dryRun) {
    console.log(chalk.dim(`  [dry-run] ${succeeded} file${succeeded !== 1 ? 's' : ''} would be affected`));
  } else if (errors === 0) {
    console.log(chalk.green.bold(`  ✅ Rollback complete. ${succeeded} file${succeeded !== 1 ? 's' : ''} restored/deleted.`));
    if (skipped > 0) console.log(chalk.dim(`     ${skipped} skipped`));
    console.log('');
    console.log(chalk.dim(`  Note: package.json deps installed by corral init are not removed.`));
    console.log(chalk.dim(`  Run: npm uninstall better-auth (etc.) if you want a clean slate.`));
  } else {
    console.log(chalk.red.bold(`  ❌ Rollback had ${errors} error${errors !== 1 ? 's' : ''}`));
    console.log(chalk.dim(`     ${succeeded} succeeded, ${skipped} skipped`));
  }
  console.log('');

  if (jsonOutput({ manifest: { timestamp: manifest.timestamp, command: manifest.command }, results, summary: { succeeded, errors, skipped } }, !!opts.json)) return;
}

// ─── Exported entry point ─────────────────────────────────────────────────────

export async function rollbackCommandHandler(opts: {
  json?: boolean;
  list?: boolean;
  dryRun?: boolean;
  timestamp?: string;
}) {
  if (opts.list) {
    listCommand({ json: opts.json });
    return;
  }

  rollbackCommand(opts.timestamp, { json: opts.json, dryRun: opts.dryRun });
}
