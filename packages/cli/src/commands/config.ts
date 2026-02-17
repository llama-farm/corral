import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import chalk from 'chalk';
import { loadConfigRaw, saveConfig, validateConfig, setNestedValue } from '../config.js';
import { success, error as logError, info, jsonOutput } from '../util.js';

export async function configValidateCommand(opts: { json?: boolean; config: string }) {
  let raw;
  try {
    raw = loadConfigRaw(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  const { valid, errors } = validateConfig(raw);

  if (opts.json) {
    jsonOutput({ valid, errors }, true);
    return;
  }

  if (valid && errors.length === 0) {
    success('Config valid');
  } else {
    for (const err of errors) {
      logError(err);
    }
    if (!valid) logError('Config validation failed');
  }
}

export async function configEditCommand(opts: { json?: boolean; config: string }) {
  if (opts.json) {
    jsonOutput({ action: 'edit', config: opts.config }, true);
    return;
  }
  info(`Opening ${opts.config} in your editor`);
  try {
    execSync(`open ${opts.config}`, { stdio: 'inherit' });
  } catch {
    info(`Could not open editor. Edit ${opts.config} manually.`);
  }
}

export async function configSetCommand(key: string, value: string, opts: { json?: boolean; config: string }) {
  let raw;
  try {
    raw = loadConfigRaw(opts.config);
  } catch (e: any) {
    logError(e.message);
    return;
  }

  setNestedValue(raw, key, value);
  saveConfig(opts.config, raw);

  const { valid, errors } = validateConfig(raw);

  if (opts.json) {
    jsonOutput({ key, value, valid, errors }, true);
    return;
  }

  success(`Set ${chalk.cyan(key)} = ${chalk.yellow(String(value))}`);
  if (!valid) {
    for (const err of errors) logError(err);
  }
}

export async function configDiffCommand(opts: { json?: boolean; config: string }) {
  let content;
  try {
    content = readFileSync(opts.config, 'utf-8');
  } catch (e: any) {
    logError(e.message);
    return;
  }

  if (opts.json) {
    jsonOutput({ config: opts.config, content }, true);
    return;
  }

  info('Config diff (local vs deployed — deploy tracking not yet implemented):');
  console.log(chalk.dim('--- deployed'));
  console.log(chalk.bold('+++ local'));
  for (const line of content.split('\n')) {
    console.log(chalk.green(`+ ${line}`));
  }
}
