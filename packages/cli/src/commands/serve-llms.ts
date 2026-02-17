// serve-llms.ts — helper to generate and write public/.well-known/llms.txt
// Generates a concise, project-specific llms.txt so agents know how to
// interact with this app's auth and billing system.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { parse } from 'yaml';
import { success, warn } from '../util.js';

/**
 * Generate a concise project-specific llms.txt from corral.yaml.
 * Produces just what an agent needs to interact with this app's auth.
 */
export function generateProjectLlmsTxt(configPath: string): string {
  let raw: Record<string, any> = {};
  try {
    raw = parse(readFileSync(configPath, 'utf-8')) || {};
  } catch {
    raw = {};
  }

  const appName = raw.app?.name || 'App';
  const baseUrl = (raw.app?.url || raw.app?.domain || 'http://localhost:3000').replace(/\/$/, '');
  const authBase = `${baseUrl}/api/auth`;

  const L: string[] = [];

  L.push(`# ${appName} Auth`);
  L.push('');
  L.push(`> This app uses Corral for auth + billing. Base URL: ${baseUrl}`);
  L.push('');
  L.push('## Auth Endpoints');
  L.push(`POST ${authBase}/sign-up/email { email, password, name }`);
  L.push(`POST ${authBase}/sign-in/email { email, password }`);
  L.push(`GET  ${authBase}/get-session`);

  // Social providers
  const methods = raw.auth?.methods || {};
  const socialList = ['google', 'github', 'apple', 'discord', 'microsoft', 'twitter'];
  const socials: string[] = [];
  for (const p of socialList) {
    if (methods[p]) socials.push(p);
  }
  if (Array.isArray(raw.auth?.social)) {
    for (const p of raw.auth.social as string[]) {
      if (!socials.includes(p)) socials.push(p);
    }
  }
  if (Array.isArray(raw.auth?.providers)) {
    for (const p of raw.auth.providers as string[]) {
      if (!socials.includes(p) && socialList.includes(p)) socials.push(p);
    }
  }
  if (socials.length > 0) {
    L.push(`GET  ${authBase}/sign-in/social?provider=<${socials.join('|')}>&callbackURL=/`);
  }
  L.push('');

  // Plans
  const plans: any[] = Array.isArray(raw.plans) ? raw.plans : [];
  if (plans.length > 0) {
    L.push('## Plans');
    for (const p of plans) {
      const price = (p.price ?? 0) === 0 ? '$0' : `$${p.price}/mo`;
      const trial = p.trial_days ? `, ${p.trial_days}-day trial` : '';
      L.push(`- ${p.name} (${price}${trial})`);
    }
    L.push('');
  }

  // Features
  const features = raw.features ? Object.entries(raw.features as Record<string, any>) : [];
  if (features.length > 0) {
    L.push('## Features');
    for (const [id, planList] of features) {
      const planStr = Array.isArray(planList)
        ? (planList as string[]).join(', ')
        : String(planList);
      L.push(`- ${id}: [${planStr}]`);
    }
    L.push('');
  }

  L.push('## Corral CLI');
  L.push('npx create-corral add feature <name> --plan <plan>');
  L.push('npx create-corral doctor');
  L.push('Full docs: https://docs.llamafarm.dev/corral/llms.txt');
  L.push('');

  return L.join('\n');
}

/**
 * Write public/.well-known/llms.txt from current corral.yaml.
 * Only writes if the public/ directory exists (Next.js projects).
 * Call from init to create, and from add commands to regenerate.
 */
export function writeProjectLlmsTxt(configPath: string = 'corral.yaml'): void {
  if (!existsSync('public')) return;

  try {
    const content = generateProjectLlmsTxt(configPath);
    const dir = 'public/.well-known';
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/llms.txt`, content, 'utf-8');
    success('Updated public/.well-known/llms.txt');
  } catch (e: any) {
    warn(`Could not write public/.well-known/llms.txt: ${e.message}`);
  }
}
