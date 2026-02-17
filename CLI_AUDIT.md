# Corral CLI Command Audit

Date: 2026-02-17
Project: `packages/cli`

## Scope
Audited all 18 command files in `src/commands/` plus `src/index.ts` command registration.

Checks performed:
1. Read each command file
2. Looked for obvious bugs (imports, missing functions, dead/unreachable paths, command behavior mismatches)
3. Verified template references against `src/templates/`
4. Checked command registration consistency in `src/index.ts`
5. Ran TypeScript compile check: `npx tsc --noEmit`

## Fixes Applied

### 1) `src/commands/config.ts`
- **Issue (WARN):** `config edit` used macOS-only `open`, which breaks on Linux/Windows.
- **Fix:** Added cross-platform editor launch behavior:
  - Prefer `$VISUAL` / `$EDITOR`
  - Fallback to `open` (macOS), `start` (Windows), `xdg-open` (Linux)
- **Result:** Command now works more consistently across platforms.

### 2) `src/commands/llms-txt.ts`
- **Issue (WARN):** `--full` was ignored when `--output` was used; output always wrote standard `llms.txt` content.
- **Fix:** In file-output mode, command now respects `--full` for primary output and writes the alternate variant as a secondary file.
- **Issue (WARN):** Serve mode did not expose `/llm.txt` alias though related docs/prompts referenced it.
- **Fix:** Added `/llm.txt` alias in serve mode.
- **Result:** Output behavior now matches CLI flags and documented aliases.

## Template Reference Validation
All `.tmpl` references used by command code were checked and exist in `src/templates/`.
No missing template files were found.

## Command Assessments

- `add.ts` — **PASS** (template refs valid; command wiring and subcommands healthy)
- `analyze.ts` — **PASS**
- `backup.ts` — **PASS**
- `config.ts` — **PASS** (fixed cross-platform editor launch)
- `dev.ts` — **PASS**
- `doctor.ts` — **PASS**
- `init.ts` — **PASS** (template refs valid)
- `llms-txt.ts` — **PASS** (fixed `--full` output behavior + `/llm.txt` alias)
- `rollback.ts` — **PASS**
- `seed.ts` — **PASS**
- `serve-llms.ts` — **PASS**
- `status.ts` — **PASS**
- `stripe-sync.ts` — **PASS**
- `stripe.ts` — **PASS**
- `test.ts` — **PASS**
- `users.ts` — **PASS**
- `validate.ts` — **PASS**
- `verify.ts` — **PASS**

## CLI Entry Point Assessment
- `src/index.ts` — **PASS**
  - All audited commands are registered and wired correctly.
  - `stripe sync` (preview) and `stripe push` (real API sync) are intentionally separated and correctly mapped.

## Compile Verification
Executed:

```bash
cd /Users/robthelen/clawd/agents/explorer/corral/packages/cli
npx tsc --noEmit
```

Result: **PASS** (no TypeScript errors)
