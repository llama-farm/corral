# Corral Docs Update Summary (v0.4.1)

Updated the requested documentation pages under `corral/docs/` for Corral **v0.4.1** and fixed outdated references.

## Files updated

1. **quickstart.html**
- Updated init flow to start with `npm create corral@latest` and then `corral init`.
- Added explicit framework/database detection output example.
- Added feature showcase output including generated agent files (`llms-agent-prompt.md`, `.corral/agent-checklist.json`).
- Added a copy-paste prompt block for coding agents.

2. **cli.html**
- Added a new **Command Catalog (18 commands in v0.4.1)** section.
- Explicitly included required commands: `deploy`, `analyze`, `verify`, `rollback`, `llms-txt`.
- Added `corral deploy docker|fly|railway|render` examples.
- Added missing sections for `deploy`, `verify`, `test`, `config`, `users`, `backup`.
- Removed outdated `promote` command section.
- Updated version text from `0.1.0` to `0.4.1`.

3. **frameworks.html**
- Added v0.4.1 framework detection callout listing all supported detected frameworks:
  Express, Hono, Fastify, Koa, Hapi, Polka, Restify, NestJS, AdonisJS, Elysia, H3/Nitro, Oak, Sails, Next.js, Vite+React, CRA, FastAPI, Django, Flask.
- Clarified Corral embeds into existing servers/frameworks.

4. **deployment.html**
- Added CLI-first deployment callout with:
  `corral deploy docker|fly|railway|render`.
- Added explicit Render section and sidebar link.
- Ensured Docker, Fly.io, Railway, and Render are covered.

5. **agents.html**
- Updated outdated command references away from old `create-corral` invocation patterns.
- Added section for **copy-paste prompts and agent files**:
  - homepage/quickstart prompt usage
  - `llms-agent-prompt.md`
  - `.corral/agent-checklist.json`
- Updated embedded version reference to v0.4.1.

6. **billing.html**
- Added v0.4.1 billing callout covering:
  - `corral stripe sync` (alias `corral stripe push`)
  - checkout
  - billing portal
  - webhook registration/handling
  - usage metering
  - free trials

7. **gating.html**
- Added v0.4.1 generated-gates callout listing:
  `AuthGate`, `PlanGate`, `FeatureGate`, `BlurGate`, `PageGate`, `SkeletonPage`.
- Included admin bypass behavior note.

8. **concepts.html**
- Corrected outdated admin-role command reference (`corral promote`) to current user/admin management wording.
- General v0.4.1 consistency pass.

9. **api.html**
- Added v0.4.1 endpoint index block for auth + billing coverage, including:
  session/sign-in/sign-up/sign-out, verify email, password reset, magic link/OTP, device auth endpoints, API keys, checkout/portal/webhook/cancel/reactivate, usage endpoints, and admin endpoints.

## Version cleanup
- Updated `0.1.0` references to `0.4.1` across the targeted docs pages.
- Also updated version strings in `llms.txt` and `llms-full.txt` where found.

## Notes
- Existing long-form content remained largely intact; updates were additive/targeted for v0.4.1 accuracy and required command/page coverage.
