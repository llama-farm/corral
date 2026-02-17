import chalk from 'chalk';

export function jsonOutput(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  }
  return json;
}

export function info(msg: string) { console.log(chalk.blue('ℹ'), msg); }
export function success(msg: string) { console.log(chalk.green('✓'), msg); }
export function warn(msg: string) { console.log(chalk.yellow('⚠'), msg); }
export function error(msg: string) { console.log(chalk.red('✗'), msg); }

export function table(rows: Record<string, string>[]) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const widths = keys.map(k => Math.max(k.length, ...rows.map(r => (r[k] || '').length)));
  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  console.log(chalk.bold(header));
  console.log(widths.map(w => '─'.repeat(w)).join('──'));
  for (const row of rows) {
    console.log(keys.map((k, i) => (row[k] || '').padEnd(widths[i])).join('  '));
  }
}
