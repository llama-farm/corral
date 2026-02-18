# Corral Launch Posts — Draft for Review

**Version:** v0.4.1 (`create-corral@0.4.1` on npm)
**Updated:** 2026-02-17

---

## 1. Show HN Post

**Title:** Show HN: Corral – Auth + Stripe billing that AI coding agents can set up

**URL:** https://github.com/llama-farm/corral

**Text (post as first comment, plain text, no markdown):**

```
Hey HN. I built Corral because every time I asked an AI coding agent to
"add auth and payments," it hallucinated for an hour and produced broken
code. Wrong imports, phantom endpoints, a login page wired to nothing.

The problem isn't the agent. It's that auth-to-billing-to-gating is
genuinely hard to wire, and there's no machine-readable spec for how to
do it.

Corral is an open-source CLI (MIT) that gives your agent a spec it can
read (llms.txt), then scaffolds auth + Stripe billing into your existing
project. It detects your framework (Express, Next.js, Hono, Fastify, and
13+ more), embeds into your existing server (doesn't create a new one),
and generates working components: profile page, admin dashboard, plan
gating, Stripe checkout, usage metering. One YAML config file controls
everything.

The agent workflow is 9 commands. Every command supports --json. Errors
include a "fix" field. Exit 0 means deploy-ready.

I hardened this across 10 framework/DB combos with blind agent tests: 3
AI models, 3 rounds each, then a 10-agent fleet. Found and fixed real
edge cases like Express 4 vs 5 route patterns, Vite proxy ordering, and
agents creating duplicate servers instead of embedding into existing ones.

To try it, paste this into any AI coding agent:

  Read: https://llama-farm.github.io/corral/llms.txt
  Add auth and Stripe billing to my app.

Built on Better Auth + Stripe. 18 CLI commands, 30+ templates.

GitHub: https://github.com/llama-farm/corral
npm: npx create-corral init
Docs: https://llama-farm.github.io/corral/
```

**HN formatting notes:**
- This is plain text. No markdown renders on HN.
- Code/commands use 2-space indent for monospace.
- Links auto-render from raw URLs.
- Post the URL field as the submission link. This text goes as your first comment.

---

## 2. Reddit Post (r/webdev)

**Title:** I built an open-source CLI that lets AI coding agents add auth + Stripe billing to any app. One prompt, no auth code. [MIT]

**Body:**

Auth is where every vibe-coded app dies.

Your agent builds the UI in 30 seconds. The API in two minutes. Then you say "add auth and payments" and watch it hallucinate for an hour. Wrong imports. Phantom endpoints. A login page that doesn't connect to anything.

So I built [Corral](https://github.com/llama-farm/corral): an open-source CLI that gives AI agents a machine-readable spec for auth + billing, then scaffolds everything into your project.

### How it works

Paste this into your agent (Claude Code, Cursor, Codex, Windsurf, whatever):

```
Read: https://llama-farm.github.io/corral/llms.txt

Add auth and Stripe billing to my app. Free tier + Pro at $29/mo
with 14-day trial. Wire up everything.
```

Your agent reads the spec, runs `npx create-corral init`, and your app gets:

**Auth** (works immediately): email/password, Google/GitHub/Apple + 6 more OAuth providers, magic links, email OTP, session management, password reset.

**Generated UI** (your agent wires these in): profile page, admin dashboard with user management, account menu dropdown, upgrade banners, plan gating (`<PlanGate plan="pro">` with blur/skeleton/block modes), feature flags per plan.

**Billing** (Stripe): checkout, billing portal, usage metering with per-plan limits, free trials.

**Deploy:** `corral deploy docker|fly|railway|render`

After scaffolding, Corral proactively tells the agent every feature that's available and asks "want me to wire up everything?" Most users don't even know they can get an admin dashboard and usage metering. The agent offers it before you ask.

### How it's different from Auth0/Clerk/Supabase Auth

**It's not a service.** No hosted dashboard. No per-MAU pricing. It generates code into your project, uses your database. MIT license, runs anywhere.

**Agent-native from the ground up.** `llms.txt` spec your agent reads. `--json` on all 18 CLI commands. A `.corral/agent-checklist.json` so the agent tracks its own progress. `corral doctor` reports what's still unwired.

**Framework auto-detection.** 13+ JS frameworks (Express, Hono, Fastify, Koa, NestJS, Elysia, H3...) plus Next.js, Vite+React, FastAPI, Django, Flask. It scans your actual server entry files. If you have an Express server, it embeds into it instead of creating a new one.

### How I tested it

Blind agent tests across 10 framework/DB combos. 3 AI models, 3 rounds each, then a 10-agent hardening fleet. Found and fixed real edge cases: Express 4/5 route patterns, monorepo workspace detection, Vite proxy conflicts, agents creating duplicate auth servers.

`create-corral@0.4.1` on npm right now.

[GitHub](https://github.com/llama-farm/corral) | [Docs](https://llama-farm.github.io/corral/) | [llms.txt](https://llama-farm.github.io/corral/llms.txt)

Built this because I needed it. Happy to answer questions.

---

## Posting Notes

- **HN:** Title + URL as submission. Text as first comment (plain text only, no markdown). Best time: 8-9am EST weekdays.
- **Reddit:** r/webdev is the primary target. Cross-post options: r/SaaS, r/selfhosted, r/reactjs. Best time: weekday mornings.
- **Anticipated pushback:**
  - "Why not just use Better Auth directly?" -> Corral adds billing, gating, usage meters, UI components, agent integration, and framework detection on top. Better Auth is the foundation, Corral is the product.
  - "Auth0/Clerk is easier" -> For humans, maybe. For agents, Corral is 10x easier. And no per-MAU bill.
  - "What about security?" -> Better Auth handles the crypto. Corral scaffolds it correctly. No rolling your own.
