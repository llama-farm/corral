# Corral Launch Posts — Draft for Review

**Version:** v0.4.1 (`create-corral@0.4.1` on npm)
**Updated:** 2026-02-17

---

## 1. Show HN Post

**Title:** Show HN: Corral – Auth + Stripe billing that AI coding agents can set up

**URL:** https://github.com/llama-farm/corral

**Text (post as first comment):**

Hey HN — I built Corral because every time I asked an AI coding agent to "add auth and payments," it hallucinated for an hour and produced broken code. Wrong imports, phantom endpoints, a login page wired to nothing.

The problem isn't the agent — it's that auth-to-billing-to-gating is genuinely hard to wire, and there's no machine-readable spec for how to do it.

**What Corral is:** An open-source CLI (`npx create-corral`, MIT license) that gives your agent a spec it can actually read (`llms.txt`), then scaffolds auth + Stripe billing into your existing project. Not a hosted service — it generates code into your app.

**What happens when your agent runs it:**

1. Detects your framework — Express, Next.js, Hono, Fastify, Koa, NestJS, Elysia, H3, FastAPI, and 13+ more. Scans your actual server entry files, not just package.json.

2. Embeds auth into your existing server. Doesn't create a new one. Same database (SQLite/PG/MySQL/Turso/D1), same process, same deploy.

3. Generates real, working components — not stubs:
   - Profile page (edit name, change password, delete account)
   - Admin dashboard (user list, role management, plan overrides)
   - Account menu (navbar dropdown)
   - Plan gating (`<PlanGate>`, `<FeatureGate>` with blur/skeleton/block modes)
   - Stripe checkout + billing portal, wired to actual buttons
   - Usage metering with per-plan limits

4. Proactively tells the agent what to wire up. After scaffolding, the CLI prints a feature showcase and generates a `.corral/agent-checklist.json` so the agent tracks its own progress. `corral doctor` reports what's still unfinished.

5. Generates deployment configs: `corral deploy docker|fly|railway|render`.

**The agent workflow is 9 commands:**

```
corral analyze → init → add provider → add plan → add feature → add meter → stripe sync → validate → seed
```

Every command supports `--json`. Errors include a `"fix"` field. Exit 0 = deploy-ready.

**The copy-paste prompt to get started:**

```
Read: https://llama-farm.github.io/corral/llms.txt
Add auth and Stripe billing to my app.
```

I hardened this across 10 framework/DB combos with blind agent tests — 3 AI models, 3 rounds each, then a 10-agent fleet. Found and fixed edge cases like Express 4 vs 5 route patterns, Vite proxy ordering, Next.js rewrite conflicts, monorepo workspace detection, and agents creating duplicate servers instead of embedding into existing ones.

Built on Better Auth + Stripe. 18 CLI commands, 30+ templates, all MIT.

GitHub: https://github.com/llama-farm/corral
npm: `npx create-corral init`
Docs + llms.txt: https://llama-farm.github.io/corral/

---

## 2. Reddit Post (r/webdev)

**Title:** I built an open-source CLI that lets AI coding agents add auth + Stripe billing to any app. One prompt, no auth code. [MIT]

**Body:**

Auth is where every vibe-coded app dies.

Your agent builds the UI in 30 seconds. The API in two minutes. Then you say "add auth and payments" and watch it hallucinate for an hour. Wrong imports. Phantom endpoints. A login page that doesn't connect to anything. Every. Single. Time.

So I built **[Corral](https://github.com/llama-farm/corral)** — an open-source CLI that gives AI agents a machine-readable spec for auth + billing, then scaffolds everything into your project.

### How it works

You paste this into your agent (Claude Code, Cursor, Codex, OpenClaw, Windsurf — anything):

```
Read: https://llama-farm.github.io/corral/llms.txt

Add auth and Stripe billing to my app. Free tier + Pro at $29/mo
with 14-day trial. Wire up everything: login, signup, profile page,
admin dashboard, upgrade banners, and feature gating.
```

Your agent reads the spec, runs `npx create-corral init`, and your app gets:

**Auth (works immediately):**
- ✅ Email/password, Google/GitHub/Apple + 6 more OAuth providers
- ✅ Magic links, email OTP (passwordless)
- ✅ Session management, password reset, email verification

**Generated UI (your agent wires these in):**
- 🔌 **Profile page** — edit name, change password, delete account, manage plan
- 🔌 **Admin dashboard** — user list, role management, plan overrides, stats
- 🔌 **Account menu** — navbar dropdown (profile, admin, upgrade, sign out)
- 🔌 **Upgrade banner** — shows free users what they're missing
- 🔌 **Plan gating** — `<PlanGate plan="pro">` with blur, skeleton, or block modes
- 🔌 **Feature flags** — `<FeatureGate feature="ai-chat">` per-plan toggling

**Billing (Stripe-powered):**
- 🔌 Checkout → Stripe → back to your app
- 🔌 Billing portal (invoices, payment method, cancel)
- 🔌 Usage metering with per-plan limits
- 🔌 Free trials (configurable per plan)

**Deploy:**
- 🔌 `corral deploy docker|fly|railway|render` — auto-detects your backend language

The best part: after scaffolding, Corral **proactively tells the agent** every feature that's available and asks "want me to wire up everything?" Most users don't even know they can get an admin dashboard and usage metering — the agent offers it before you ask.

### What makes it different from Auth0/Clerk/Supabase Auth

1. **It's not a service.** No hosted dashboard. No per-MAU pricing. It generates code into YOUR project, uses YOUR database. MIT license, runs anywhere.

2. **Agent-native from the ground up.** `llms.txt` spec your agent reads. `--json` on all 18 CLI commands. `CORRAL.md` integration guide generated per-project. `.corral/agent-checklist.json` so the agent tracks its own progress. `corral doctor` reports what's still unwired.

3. **Framework auto-detection.** Detects 13+ JS frameworks (Express, Hono, Fastify, Koa, NestJS, Elysia, H3...) plus Next.js, Vite+React, FastAPI, Django, Flask. Scans your actual server entry files — if you have an Express server, it embeds into it instead of creating a new one.

4. **One YAML, everything.** `corral.yaml` defines auth providers, plans, features, meters. Agent edits YAML, runs `corral stripe sync`, done.

5. **Battle-tested.** I ran blind agent tests across 10 framework/DB combos — 3 AI models × 3 rounds, then a 10-agent hardening fleet. Found and fixed real edge cases: Express 4/5 route patterns, monorepo workspace detection, Vite proxy conflicts, agents creating duplicate servers.

### By the numbers

- 18 CLI commands, all `--json`
- 30+ code generation templates
- 13+ JavaScript server frameworks detected
- 5 databases (SQLite, PG, MySQL, Turso, Cloudflare D1)
- 4 deploy platforms (Docker, Fly.io, Railway, Render)
- 9 OAuth providers built-in
- `create-corral@0.4.1` on npm right now

### Links

- **GitHub:** https://github.com/llama-farm/corral
- **npm:** `npx create-corral init`
- **Docs:** https://llama-farm.github.io/corral/
- **llms.txt** (the agent spec): https://llama-farm.github.io/corral/llms.txt

Built this because I needed it — shipping SaaS apps with AI agents and auth was always the part that broke. Now it doesn't. Happy to answer questions.

---

## Posting Notes

- **HN title:** 78 chars, under 80 limit. "Show HN" format = title + URL. The text goes as first comment, not the submission body.
- **Reddit:** r/webdev is the primary target. Cross-post options: r/SaaS (business angle), r/selfhosted (no hosted service angle), r/reactjs (component generation angle).
- **Timing:** HN — 8-9am EST weekdays. Reddit — weekday mornings.
- **Key differentiator for Q&A:** "Agent-native" — nobody else has auth designed for AI agents. The llms.txt spec + --json CLI + CORRAL.md + agent-checklist.json is the moat. It's not just auth-as-a-library, it's auth-as-an-agent-tool.
- **Anticipated pushback:**
  - "Why not just use Better Auth directly?" → Corral adds billing, gating, usage meters, UI components, agent integration, and framework detection on top. Better Auth is the foundation, Corral is the product.
  - "Auth0/Clerk is easier" → For humans, maybe. For agents, Corral is 10x easier. And no per-MAU bill.
  - "What about security?" → Better Auth handles the crypto. Corral scaffolds it correctly. No rolling your own.
