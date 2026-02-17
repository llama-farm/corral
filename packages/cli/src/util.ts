import chalk from 'chalk';

export function jsonOutput(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  }
  return json;
}

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    if (['false', '0', 'no', 'off', 'null', 'undefined'].includes(v)) return false;
    return true;
  }
  return Boolean(value);
}

export function renderTemplate(tmpl: string, vars: Record<string, string | number | boolean>): string {
  let out = tmpl;

  // Allow conditional markers to be wrapped in config-style comments.
  // Example: "# {{#if_python}}" -> "{{#if_python}}"
  out = out.replace(/^([ \t]*)(#|;|\/\/)\s*({{\s*[#/](?:if|unless)_[^}]+}})\s*$/gm, '$1$3');

  // Resolve conditional blocks (supports nesting via repeated passes)
  let prev = '';
  while (out !== prev) {
    prev = out;
    out = out.replace(/{{#if_([A-Za-z0-9_]+)}}([\s\S]*?){{\/if_\1}}/g, (_m, key: string, inner: string) => {
      return isTruthy(vars[key]) ? inner : '';
    });
    out = out.replace(/{{#unless_([A-Za-z0-9_]+)}}([\s\S]*?){{\/unless_\1}}/g, (_m, key: string, inner: string) => {
      return isTruthy(vars[key]) ? '' : inner;
    });
  }

  // Replace simple {{VAR}} placeholders.
  out = out.replace(/{{([A-Za-z0-9_]+)}}/g, (match, key: string) => {
    return key in vars ? String(vars[key]) : match;
  });

  return out;
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
