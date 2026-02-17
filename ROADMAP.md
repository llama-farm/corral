# Corral Roadmap

## v0.1 (Current) — Core Packages
- [x] Server package (@llamafarm/corral)
- [x] UI components (@llamafarm/corral-ui) 
- [x] CLI (corral)
- [ ] HORIZON fork integration (in progress)
- [ ] Verify Better Auth + Stripe end-to-end
- [ ] DemoFly demo of working integration

## v0.2 — Agent Experience
All of these are about making the USER's agent (Claude Code, Codex, Cursor, OpenClaw, etc.) able to one-shot Corral integration. We provide prompts, templates, CORRAL.md — the agent does the work.

1. **`corral init --analyze`** — reads existing app code, detects what it builds, auto-generates corral.yaml with sensible plans/meters/nudges. Agent runs ONE command.
2. **Live Preview Server** — `corral dev` serves preview of all UI components with YOUR config data. /preview/login, /preview/plans, /preview/profile, /preview/admin. Iterate on YAML, see results instantly.
3. **`corral doctor`** — diagnostic that checks config, DB, Stripe, seed state, webhooks, user health. Agents love diagnostic tools for immediate context.
4. **Route-level Feature Gating** — YAML `routes:` block auto-generates Next.js middleware. No manual checkUsage() per route. Agent adds one line to YAML.
5. **Webhook Playground** — `corral stripe test-webhook subscription.created` etc. Fire fake events locally. CI-friendly.
6. **Usage Alerts to Agents** — webhook/OpenClaw event when users hit limits or payments fail. Agents can auto-respond.
7. **Migration Assistant** — `corral migrate --from clerk|supabase|auth0`. Reads existing config, maps users, generates corral.yaml.
8. **Better Templates** — Default corral.yaml with pre-written nudges (uncomment), project-type-aware meters, standalone /pricing page component, email templates (welcome, trial ending, payment failed, receipt).
9. **Agent Observability in Admin** — "Agent Activity" tab: config diffs, CLI commands, seed ops, Stripe syncs. Human visibility into agent actions.
10. **Natural Language Admin** — "Give user X 50% off for 3 months" → auto-creates Stripe coupon, applies, emails. YAML stays source of truth, humans change it by talking.
