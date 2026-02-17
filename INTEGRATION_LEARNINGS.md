# Corral Integration Learnings
*From first real integration: HORIZON (Next.js 14 App Router) — 2026-02-16*

These are real bugs/gotchas hit during the first Corral integration. ALL of these must be handled automatically by `corral init`, the generated CORRAL.md, and the server package.

## 1. SQLite Database Config — `new Database()` not URL string
**Bug:** Better Auth does NOT accept `{ url: "file:./corral.db", type: "sqlite" }`. It expects a `better-sqlite3` instance: `new Database("./corral.db")`.
**Fix:** Corral server must handle this internally. `createCorral()` should accept a simple `database: "sqlite"` or `database: "postgres"` string and construct the right adapter. User should NEVER see `BetterAuthError: Failed to initialize database adapter`.
**Action:**
- `@llamafarm/corral` server: detect database type from config, create correct adapter
- `corral init`: install correct driver package (`better-sqlite3` for SQLite, `pg` for Postgres)
- CORRAL.md: document that SQLite needs `better-sqlite3` package

## 2. Next.js API Rewrites Conflict
**Bug:** HORIZON had `rewrites()` in `next.config.js` proxying ALL `/api/*` to a Python backend on port 8074. This captured `/api/auth/*` requests before Next.js route handlers could handle them, giving "Not Found" from the Python server.
**Fix:** Must exclude `/api/auth` from rewrites using negative lookahead: `'/api/:path((?!auth).*)'`
**Action:**
- `corral init --analyze`: detect existing `next.config.js` rewrites and warn/auto-fix
- CORRAL.md: document rewrite conflicts prominently with code example
- `corral doctor`: check if auth routes are being proxied (hit `/api/auth/ok` and verify response)

## 3. Missing Environment Variables
**Bug:** Better Auth requires `BETTER_AUTH_SECRET` (32+ chars) and `BETTER_AUTH_URL` (base URL). Without them: warnings crash the process as unhandled rejections, and callbacks/redirects fail.
**Fix:** These MUST be set before first run.
**Action:**
- `corral init`: auto-generate `BETTER_AUTH_SECRET` and add to `.env` (like the docs suggest `openssl rand -base64 32`)
- `corral init`: detect app port from package.json scripts and set `BETTER_AUTH_URL`
- `corral dev`: check for these env vars FIRST and error with clear instructions
- `corral doctor`: verify env vars exist and are valid
- CORRAL.md: list required env vars with examples

## 4. Missing SQLite Driver Package
**Bug:** `better-sqlite3` is a native module that must be explicitly installed. It's not a dependency of `better-auth` itself.
**Fix:** Install it as part of init.
**Action:**
- `corral init`: auto-install `better-sqlite3` when database type is SQLite
- For Postgres: auto-install `pg`
- For MySQL: auto-install `mysql2`
- CORRAL.md: list required driver packages per database type

## 5. Unhandled Rejection Crashes
**Bug:** Better Auth warnings (base URL, database) throw as unhandled promise rejections in Next.js dev mode, killing the process entirely. No error page, no recovery — just dead.
**Fix:** Corral should catch these.
**Action:**
- `@llamafarm/corral` server: wrap Better Auth initialization in try/catch with clear error messages
- Add process-level unhandled rejection handler that logs but doesn't crash
- `corral doctor`: pre-flight check that catches these before the app even starts

## 6. basePath Must Match Route Handler Path
**Bug:** If Better Auth's `basePath` is `/api/auth` but the Next.js catch-all route is at a different path, nothing works.
**Fix:** Convention over configuration.
**Action:**
- `corral init`: always generate route handler at `app/api/auth/[...all]/route.ts`
- `@llamafarm/corral`: default basePath to `/api/auth` always
- CORRAL.md: document the expected route structure

## 7. Client-Side Auth Provider Needs Server URL
**Bug:** The CorralProvider needs `serverUrl="/api/auth"` to know where to send auth requests. Easy to misconfigure.
**Fix:** Default it.
**Action:**
- CorralProvider: default `serverUrl` to `/api/auth` (convention)
- Document that this matches the basePath
- If they differ, `corral doctor` should detect the mismatch

## 8. Layout Must Be Client Component (App Router)
**Bug:** Wrapping children in `<CorralProvider>` requires `"use client"` in the layout. This means metadata export must move to `<head>` tags or a separate `metadata.ts`.
**Fix:** Document clearly.
**Action:**
- `corral init`: detect if layout.tsx uses metadata export and warn
- CORRAL.md: provide exact code for converting layout to client component
- Better: provide a `CorralLayout` wrapper component that handles this pattern

## 9. Database Must Auto-Bootstrap (THE #1 LEARNING)
**Bug:** Better Auth throws `no such table: user` on first request if tables don't exist. The `@better-auth/cli migrate` command exists but requires manual intervention, may OOM, and is an extra step agents/users shouldn't need.
**Fix:** Auto-create tables on server start. `CREATE TABLE IF NOT EXISTS` is fully idempotent and safe to run every time.
**Action:**
- `lib/corral.ts` template: `bootstrapDatabase()` function runs on import, creates all Better Auth + Corral tables
- `@llamafarm/corral` server: `bootstrapDatabase()` called in `createAuth()` before Better Auth initializes
- Supports both SQLite (db.exec) and PostgreSQL (pool.query) 
- Also sets WAL mode for SQLite and creates performance indexes
- **ZERO MANUAL STEPS. The database just works on first run.**

## 10. TypeScript Types for Database Drivers
**Bug:** Production build fails with `Could not find a declaration file for module 'better-sqlite3'`. TypeScript strict mode requires type declarations.
**Fix:** Install `@types/better-sqlite3` alongside `better-sqlite3`.
**Action:**
- `corral init`: also install `@types/better-sqlite3` as devDep for SQLite
- CORRAL.md: mention this in the packages section

## 10. Dev Server OOM / SIGKILL
**Bug:** Next.js dev server gets SIGKILL during heavy compilation (large dashboard + auth modules). Multiple hot-reload compilations stack up and exceed memory.
**Fix:** Set `NODE_OPTIONS="--max-old-space-size=2048"` for dev or use production build.
**Action:**
- `corral dev`: set memory limit automatically
- CORRAL.md: warn about this for large apps
- Consider: `corral dev` could pre-build then use `next start` for stability

## 11. Route Handler Error Handling
**Bug:** Better Auth can throw unhandled promise rejections from the route handler, crashing Next.js dev server entirely. No error page, just dead process.
**Fix:** Wrap GET/POST handlers in try/catch.
**Action:**
- `corral init` route template: generate wrapped handlers with try/catch
- CORRAL.md: document this pattern

## 12. Next.js .env.local vs .env Placement
**Bug:** In monorepo setups where Next.js runs from a subdirectory (e.g., `frontend/`), placing env vars in the parent `.env` doesn't work. Next.js only reads `.env.local` from its own root.
**Fix:** `corral init` must write to `.env.local` for Next.js projects.
**Action:**
- `corral init`: detect Next.js and write to `.env.local` instead of `.env`
- `corral doctor`: warn if BETTER_AUTH_SECRET is in `.env` but not `.env.local` for Next.js projects
- CORRAL.md: document this gotcha prominently
**Status:** ✅ Baked into init, doctor, and CORRAL.md template

## 13. Sign Out Requires Content-Type Header
**Bug:** `POST /api/auth/sign-out` returns HTTP 415 (Unsupported Media Type) if you don't send `Content-Type: application/json`.
**Fix:** Always include the header, even with empty body.
**Action:**
- CORRAL.md: document in API section
- `corral test`: already sends correct headers
**Status:** ✅ Baked into CORRAL.md template and test command

## 14. Route Handler MUST Have try/catch (Not Optional)
**Bug:** `toNextJsHandler(auth)` returns bare handlers. When Better Auth throws (missing env vars, DB errors, malformed requests), the unhandled rejection kills the Next.js dev server process entirely. No error page, no recovery.
**Fix:** Generated route template now wraps both GET and POST in try/catch.
**Action:**
- Route template: uses wrapped handlers with error responses
- `corral doctor`: checks if route handler has try/catch, warns if missing
- CORRAL.md: warns not to simplify the try/catch away
**Status:** ✅ Baked into route template, doctor, and CORRAL.md

## 15. Next.js Rewrite Auto-Fix
**Bug:** Many Next.js apps proxy `/api/*` to a backend via `rewrites()`. This silently intercepts `/api/auth/*` before the route handler can respond. Agents and users don't realize why auth returns 404.
**Fix:** `corral init` now auto-fixes the rewrite pattern from `/api/:path*` to `/api/:path((?!auth).*)`.
**Action:**
- `corral init`: auto-fixes `next.config.js` rewrites (not just warns)
- `corral doctor`: detects unfixed rewrites
**Status:** ✅ Baked into init (auto-fix) and doctor (detection)

## 16. SPA (React/Vite) Requires Standalone Auth Server
**Bug:** Better Auth is a server-side library. It uses `better-sqlite3` (native Node), `crypto`, filesystem access — none of which work in the browser. A plain React SPA has no server.
**Fix:** `corral init` detects Vite/CRA/plain React and scaffolds a standalone Express auth server in `server/` with CORS, auto-bootstrap, and proper `trustedOrigins`.
**Action:**
- `corral init`: detects `vite` + `react` in deps → sets `isSPA: true`
- Scaffolds `server/corral.ts` (auth setup with trustedOrigins) + `server/auth.ts` (Express entrypoint)
- Adds `dev:auth` and `dev:all` scripts to package.json
- Installs `express`, `cors`, `tsx`, `concurrently` automatically
- Prints Vite proxy config to add to `vite.config.ts`
- Sets `CORS_ORIGIN` and `CORRAL_PORT` env vars
**Status:** ✅ Baked into init, doctor, CORRAL.md template

## 17. Vite Proxy Order Matters
**Bug:** If `vite.config.ts` has a `/api` proxy before `/api/auth`, the catch-all wins and auth requests go to the wrong backend.
**Fix:** `/api/auth` must come BEFORE `/api` in the proxy config.
**Action:**
- `corral init`: warns if `/api` proxy exists without specific `/api/auth` entry
- CORRAL.md: documents proxy order requirement
**Status:** ✅ Baked into init and CORRAL.md template

## 18. SPA: `trustedOrigins` Required for Better Auth
**Bug:** Better Auth rejects cross-origin requests if the origin isn't in `trustedOrigins`. SPA dev servers run on different ports (5173 vs 3001).
**Fix:** `setup-spa.ts.tmpl` includes `trustedOrigins: [process.env.CORS_ORIGIN]` and `corral init` sets `CORS_ORIGIN` automatically.
**Status:** ✅ Baked into SPA setup template and init

## 19. Framework Detection Must Not Default to Next.js
**Bug:** Original `detectFramework()` returned `nextjs` as default — a plain React app would get Next.js route handlers generated, which don't work.
**Fix:** Detection now checks for `vite`, `react-scripts`, `react` in deps. Falls through to `unknown` (not `nextjs`).
**Status:** ✅ Baked into init

## Summary: What `corral init` Should Do (Minimum Viable)
1. Detect framework: Next.js, Vite+React, CRA, Hono, Express, Fastify, unknown
2. Install correct packages (better-auth + DB driver + server framework)
3. Generate `corral.yaml` with sensible defaults
4. Generate `.env.local` (Next.js) or `.env` (others) with secrets + URLs
5. **Full-stack (Next.js):** `lib/corral.ts` + `app/api/auth/[...all]/route.ts` (with try/catch)
6. **SPA (React/Vite):** `server/corral.ts` + `server/auth.ts` (Express/Hono/Fastify, with CORS + trustedOrigins)
7. **SPA extras:** `dev:auth` + `dev:all` scripts, Vite proxy suggestion, CORS_ORIGIN env var
8. **Auto-fix** `next.config.js` rewrite conflicts; warn about Vite proxy order
9. Generate `CORRAL.md` for agent discovery (all 19 gotchas, architecture-specific)
10. Ensure `.gitignore` covers secrets and databases
11. Run `corral doctor` to verify everything works

## Server Framework Support Matrix
| Framework | Type | Handler Pattern | Template |
|-----------|------|----------------|----------|
| Next.js | Full-stack | `toNextJsHandler(auth)` | `route-nextjs.ts.tmpl` |
| Express | Standalone | `toNodeHandler(auth)` | `server-express.ts.tmpl` |
| Hono | Standalone/Full | `auth.handler(c.req.raw)` | `server-hono.ts.tmpl` / `route-hono.ts.tmpl` |
| Fastify | Standalone | `toNodeHandler(auth)` via raw | `server-fastify.ts.tmpl` |

## What `corral doctor` Checks (15 items)
1. Config file exists
2. BETTER_AUTH_SECRET set
3. BETTER_AUTH_URL set
4. Database driver installed
5. SQLite type declarations (@types/better-sqlite3)
6. Auth route handler exists
7. Route handler has try/catch wrapping
8. Auth setup file exists (lib/corral.ts)
9. Next.js rewrite conflicts
10. Next.js .env.local placement (monorepo awareness)
11. .gitignore covers secrets
12. Stripe keys (optional, test vs live mode)
13. Auth server reachable (/api/auth/ok)
14. CORRAL.md exists (agent discovery)

## What `corral test` Validates (8 tests)
1. Health check (/api/auth/ok)
2. Unauthenticated session returns null
3. Sign up with email/password
4. Sign in with email/password
5. Authenticated session returns user
6. Sign out
7. Session cleared after sign out
8. Wrong password rejected
