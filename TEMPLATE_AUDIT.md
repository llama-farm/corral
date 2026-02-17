# Corral CLI Template Audit

Date: 2026-02-17
Project: `packages/cli/src/templates`

## Summary

I audited all listed templates plus `src/templates/docker/`.

### Fixes applied

1. **`account-menu.tsx.tmpl`**
   - Fixed import path to use template var:
     - `../auth-context` → `{{AUTH_IMPORT_PATH}}`

2. **`device-verify-nextjs.tsx.tmpl`**
   - Replaced invalid token format `[[APP_NAME]]` with `{{APP_NAME}}` (all occurrences).
   - Removed unused `useRouter` import/variable to avoid TS lint/compile issues.

3. **`device-verify-react.tsx.tmpl`**
   - Replaced invalid token format `[[APP_NAME]]` with `{{APP_NAME}}`.

4. **`admin-api.ts.tmpl`**
   - Removed unsupported placeholder usage by replacing `{{STRIPE_PRICE_FIELD}}` with concrete key `stripe_price_id`.
   - This fixes runtime failure where regex would otherwise search for a non-replaced template token.

5. **`gates.tsx.tmpl`**
   - Reworked to include required gates and behavior:
     - `AuthGate`
     - `PlanGate` with **admin bypass**
     - `FeatureGate` with **admin bypass**
     - `BlurGate` with admin-aware lock logic

6. **`server-express.ts.tmpl`**
   - Ensured single server includes auth + CORS + admin/profile/billing API + Stripe webhook handling.
   - Moved Stripe webhook route **before** `express.json()` so raw body is available.
   - Added signature verification when webhook secret/header exists; fallback JSON parse for local/dev.
   - Added embedded mount examples for `toNodeHandler(auth)` with Express, Koa, Fastify, Hono, and generic `http.createServer`.

7. **`server-express-full.ts.tmpl`**
   - Added embedded mount examples for `toNodeHandler(auth)` with Express, Koa, Fastify, Hono, and generic `http.createServer`.

8. **`docker/docker-compose.yml.tmpl`**
   - Fixed malformed placeholder:
     - `{{{BACKEND_SRC}}}` → `{{BACKEND_SRC}}`

9. **`docker/README.md`**
   - Replaced literal example `{{PLACEHOLDER}}` with `<PLACEHOLDER>` to avoid accidental unresolved-template detection.

---

## Critical Template Requirements Check

### `profile-page.tsx.tmpl`
- ✅ edit name
- ✅ change password
- ✅ delete account
- ✅ view/change plan flow
- ⚠️ billing portal link currently shows a placeholder toast (`Manage Subscription` button does not open a real portal URL/API yet)

### `admin-panel.tsx.tmpl`
- ✅ user list
- ✅ role management
- ✅ plan override (inline)
- ✅ user search

### `account-menu.tsx.tmpl`
- ✅ profile link
- ✅ admin link (conditional)
- ✅ upgrade CTA (free users)
- ✅ sign out

### `gates.tsx.tmpl`
- ✅ AuthGate
- ✅ PlanGate
- ✅ FeatureGate
- ✅ admin bypass

### `server-express.ts.tmpl`
- ✅ auth + Stripe webhook + CORS + admin/profile/billing API in one server
- ✅ webhook body-order fix (raw body before JSON parser)
- ✅ embedded mount examples for Express, Koa, Fastify, Hono, and `http.createServer`

### `server-express-full.ts.tmpl`
- ✅ includes comprehensive cross-framework mount examples for Express, Koa, Fastify, Hono, and `http.createServer`

---

## JSX/TSX Validity Verification

I ran a TypeScript transpile check against substituted versions of critical TSX templates:

- `account-menu.tsx.tmpl`
- `admin-panel.tsx.tmpl`
- `auth-context.tsx.tmpl`
- `device-verify-nextjs.tsx.tmpl`
- `device-verify-react.tsx.tmpl`
- `gates.tsx.tmpl`
- `profile-page.tsx.tmpl`

Result: **pass** (no transpile errors).

---

## Template Variable Audit

### Valid vars expected from `init.ts`:
`APP_NAME, APP_ID, DB_ADAPTER, DB_URL, DB_PATH, PORT, FRONTEND_PORT, APP_ID_UPPER, FRAMEWORK, SERVER_FILE, ENV_SUFFIX, START_COMMAND, TRIAL_DAYS, DEFAULT_PAID_PLAN, AUTH_IMPORT_PATH, PLAN_NAMES, PAID_PLAN, PAID_PLAN_DISPLAY, PAID_PLAN_PRICE, SUCCESS_URL, CANCEL_URL`

### Findings

- ✅ Core non-docker templates now only use supported variables from the init `vars` set.
- ⚠️ **Docker templates** still use additional placeholders not in `init.ts` vars:
  - `BACKEND_LANG, BACKEND_SRC, PYTHON_MODULE, GO_MAIN, RUST_BIN, RUBY_CMD, SERVER_NAME, FLY_REGION, CORRAL_SECRET`
  - plus conditional markers (`{{#if_*}} ... {{/if_*}}`) that are not processed by current `replaceVars()`.

This indicates docker templates likely require a separate rendering path/vars provider (or are currently not fully wired to `init.ts`).

---

## SQL Validity Review

- `corral-tables.sql.tmpl` (SQLite): ✅ syntax valid.
- `corral-tables-pg.sql.tmpl` (PostgreSQL): ✅ syntax valid.
- Bootstrap SQL in setup templates (`setup.ts`, `setup-spa.ts`, `setup-pg.ts`, `setup-mysql.ts`, `setup-turso.ts`): ✅ generally valid and coherent for target DB engines.

---

## Import/Path Review

- Better Auth imports are consistent (`better-auth`, `better-auth/plugins`, `better-auth/node`).
- DB driver imports align with template intent (`better-sqlite3`, `pg`, `mysql2/promise`, `@libsql/client`).
- React templates now use configurable auth import path where needed (`account-menu.tsx.tmpl`).

---

## Remaining Gaps / Recommendations

1. **Docker template pipeline mismatch**
   - Current `replaceVars()` cannot process docker conditionals and non-init placeholders.
   - Recommend implementing a dedicated docker templating renderer (with backend-language-specific vars + conditional handling) or simplifying docker templates to static language-specific variants.

2. **Profile billing portal action**
   - `profile-page.tsx.tmpl` “Manage Subscription” should call a backend endpoint returning Stripe Billing Portal URL (or remove button until endpoint exists).

3. **FeatureGate data contract**
   - `FeatureGate` assumes `user.features?: string[]`; ensure auth context/server session payload includes it or pass custom fallback behavior.
