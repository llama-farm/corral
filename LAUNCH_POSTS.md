# Corral Launch Posts — Draft for Review

---

## 1. Show HN Post

**Title:** Show HN: Corral – Auth + Stripe billing that AI coding agents can set up (not another hosted service)

**URL:** https://github.com/llama-farm/corral

**Text:**

Hey HN — I built Corral because every time I asked an AI coding agent to "add auth and payments," it hallucinated for an hour and produced broken code. Wrong imports, phantom endpoints, login pages wired to nothing.

The problem isn't the agent — it's that auth-to-billing-to-gating is genuinely hard to wire, and there's no machine-readable spec for it.

Corral is an open-source CLI (MIT, npm) that gives your agent a spec it can actually read (llms.txt), then scaffolds everything into your existing project:

- `npx create-corral init` detects your framework (Express, Next.js, Hono, Fastify, Koa, NestJS, FastAPI — 13+ total), finds your server entry file, and embeds auth directly into it. No new services, no Docker, same database.

- One YAML config (`corral.yaml`) defines plans, features, meters, auth providers. Agent edits YAML, everything updates.

- Generates real UI components: profile page, admin dashboard, account menu, plan gating (blur/skeleton/block modes), upgrade banners. Not stubs — actual working React components with Stripe checkout wired in.

- Every CLI command supports `--json` with structured output. Errors include a `"fix"` field. Exit 0 = deploy-ready.

- Built on Better Auth + Stripe. Your app, your database (SQLite/PG/MySQL/Turso/D1), your deploy.

The workflow for agents is 9 commands: analyze → init → add providers → add plans → add features → add meters → stripe sync → validate → seed. Humans never touch auth code.

I tested this across 10 framework/database combos with blind agent tests (3 models × 3 rounds). Found and fixed a bunch of edge cases: Express 4 vs 5 route patterns, Vite proxy ordering, Next.js rewrite conflicts, monorepo workspace detection.

The copy-paste prompt that gets an agent started:

```
Read: https://llama-farm.github.io/corral/llms.txt
Add auth and Stripe billing to my app.
```

GitHub: https://github.com/llama-farm/corral
npm: `npx create-corral init`
Docs: https://llama-farm.github.io/corral/

---

## 2. Reddit Post (r/webdev)

**Title:** I built an open-source CLI that lets AI coding agents add auth + Stripe billing to any app. One prompt, no auth code.

**Body:**

Every time I ask Claude Code or Cursor to "add auth and payments" to a project, it breaks. Every. Single. Time. It'll hallucinate imports, create a login page that doesn't connect to anything, wire Stripe webhooks to nonexistent endpoints. Then I spend two hours fixing what should have been a 10-minute task.

So I built **Corral** — an open-source CLI that gives AI agents a machine-readable spec for auth + billing, then scaffolds everything into your project.

**How it works:**

You paste this into your agent:

```
Read: https://llama-farm.github.io/corral/llms.txt
Add auth and Stripe billing to my app. Free tier + Pro at $29/mo.
Wire up everything.
```

Your agent reads the spec, runs `npx create-corral init`, and your app gets:

- **Auth** — email/password, Google/GitHub/Apple + 6 more OAuth providers, magic links, email OTP
- **Profile page** — edit name, change password, delete account
- **Admin dashboard** — user list, role management, plan overrides
- **Stripe billing** — checkout, billing portal, webhooks, free trials
- **Feature gating** — `<PlanGate plan="pro">` with blur, skeleton, or block modes
- **Usage metering** — track API calls, storage, etc. with per-plan limits
- **Account menu** — dropdown component for your navbar

It's **not a hosted service**. No per-MAU pricing. No vendor lock-in. It generates code into YOUR project, uses YOUR database, deploys wherever you deploy. Built on Better Auth + Stripe.

**What makes it different from Auth0/Clerk/Supabase Auth:**

1. **Agent-native** — designed from the ground up for AI coding agents. `llms.txt` spec, `--json` on every command, `CORRAL.md` integration guide, `.corral/agent-checklist.json` to track progress
2. **Embedded** — mounts as route handlers in your existing server. Same process, same DB, zero infrastructure
3. **One YAML** — `corral.yaml` defines everything: auth providers, plans, features, meters. No dashboard clicking
4. **Framework detection** — detects Express, Hono, Fastify, Koa, NestJS, Next.js, Vite+React, FastAPI, and 13+ more. Finds your server entry file and embeds into it (doesn't create a new server)
5. **Free forever** — MIT license, no cloud dependency

**The numbers:**

- 18 CLI commands, all with `--json` output
- 30+ templates for different framework/DB combos
- 13+ JavaScript frameworks auto-detected
- 5 databases supported (SQLite, PG, MySQL, Turso, D1)
- 4 deploy targets (`corral deploy docker|fly|railway|render`)
- Tested across 10 framework/DB combos with blind AI agent testing

I've been using this with OpenClaw (my AI agent platform) and it works. Not "works in a demo" — works on real projects with real Stripe test keys and real user signups.

**Links:**
- GitHub: https://github.com/llama-farm/corral
- npm: `npx create-corral init`
- Docs: https://llama-farm.github.io/corral/
- llms.txt (the agent-readable spec): https://llama-farm.github.io/corral/llms.txt

Happy to answer questions. Built this because I needed it — figured others might too.

---

## Posting Notes

- **HN:** Keep the title under 80 chars. Don't editorialize. "Show HN" format is title + URL, with optional text. The text above is for the comment, not the submission itself.
- **Reddit r/webdev:** Good fit because it's developer tooling. r/SaaS could work too but skews more business. r/selfhosted would focus on the "no hosted service" angle.
- **Timing:** Best to post HN around 8-9am EST weekdays. Reddit r/webdev is less time-sensitive but weekdays are better.
- **Follow-up:** Be ready to answer "how is this different from X" — the key differentiator is agent-native (llms.txt, --json, CORRAL.md) + embedded (not hosted). Nobody else has auth designed for AI agents to set up.
