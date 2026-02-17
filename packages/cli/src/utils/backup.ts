/**
 * Corral Backup Utility
 *
 * Provides a lightweight file-backup mechanism so `corral rollback` can undo
 * any `corral init` or `corral add` operation.
 *
 * Usage in init/add commands:
 *
 *   import { createBackup } from '../utils/backup.js';
 *
 *   const backup = createBackup('corral init');
 *   backup.trackFile('app/layout.tsx', 'modified');   // saves original before you touch it
 *   backup.trackFile('lib/corral.ts', 'created');     // just records that we made this
 *   // ... do your file writes ...
 *   backup.save();                                    // flush manifest to .corral/backups/<ts>/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Storage location ──────────────────────────────────────────────────────────
const BACKUP_BASE = '.corral/backups';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileRecord {
  /** Path relative to project root */
  path: string;
  /** Whether this file was newly created or modified by the command */
  action: 'created' | 'modified';
  /** Original file content — only present when action === 'modified' */
  originalContent?: string;
}

export interface BackupManifest {
  timestamp: string;
  command: string;
  files: FileRecord[];
}

export interface BackupSession {
  /** ISO timestamp (with colons replaced) used as directory name */
  timestamp: string;
  /** The CLI command that triggered this session (e.g. "corral init") */
  command: string;
  /**
   * Record a file before you touch it.
   *   'created'  — file does not yet exist; rollback will delete it
   *   'modified' — file exists; rollback will restore the original content
   *
   * Call this BEFORE writing the file so the snapshot is pre-change.
   */
  trackFile(filePath: string, action: 'created' | 'modified'): void;
  /**
   * Flush the manifest to `.corral/backups/<timestamp>/manifest.json`.
   * Returns the backup directory path.
   */
  save(): string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a new backup session for a given command.
 *
 * Example:
 *
 *   const backup = createBackup('corral init');
 *   backup.trackFile('lib/corral.ts', 'created');
 *   backup.trackFile('app/layout.tsx', 'modified');
 *   writeFileSync('lib/corral.ts', newContent);
 *   patchFile('app/layout.tsx', ...);
 *   backup.save();
 */
export function createBackup(command: string): BackupSession {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const files: FileRecord[] = [];

  return {
    timestamp,
    command,

    trackFile(filePath: string, action: 'created' | 'modified'): void {
      if (action === 'modified' && existsSync(filePath)) {
        // Snapshot original content right now, before any writes
        const originalContent = readFileSync(filePath, 'utf-8');
        files.push({ path: filePath, action, originalContent });
      } else {
        // For 'created' files there's nothing to snapshot
        files.push({ path: filePath, action });
      }
    },

    save(): string {
      const backupDir = join(BACKUP_BASE, timestamp);
      mkdirSync(backupDir, { recursive: true });

      const manifest: BackupManifest = { timestamp, command, files };
      writeFileSync(
        join(backupDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      return backupDir;
    },
  };
}

/**
 * List all available backup sessions, sorted newest-first.
 */
export function listBackups(): BackupManifest[] {
  if (!existsSync(BACKUP_BASE)) return [];

  const dirs = readdirSync(BACKUP_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  const manifests: BackupManifest[] = [];

  for (const dir of dirs) {
    const manifestPath = join(BACKUP_BASE, dir, 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        manifests.push(JSON.parse(readFileSync(manifestPath, 'utf-8')));
      } catch {
        // skip corrupt manifest
      }
    }
  }

  return manifests;
}

/**
 * Load a specific backup manifest by its timestamp string.
 * Returns null if not found.
 */
export function loadBackup(timestamp: string): BackupManifest | null {
  const manifestPath = join(BACKUP_BASE, timestamp, 'manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}
