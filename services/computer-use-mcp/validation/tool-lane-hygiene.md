# Tool Lane Hygiene Validation

Date: 2026-06-01

Scope:
- `services/computer-use-mcp/src/server/tool-lane-hygiene.ts`
- `services/computer-use-mcp/src/server/tool-lane-hygiene.test.ts`
- `services/computer-use-mcp/src/server/register-tools.ts`
- `services/computer-use-mcp/src/state.ts`

Privacy note:
- Evidence is sanitized for a public repository.
- No local absolute paths, tokens, account identifiers, screenshots, or raw environment dumps are included.

Commands run:

```sh
pnpm install --ignore-scripts --frozen-lockfile
```

Result: passed. Lockfile stayed unchanged; lifecycle scripts were intentionally skipped for local verification setup.

```sh
pnpm -F @proj-airi/computer-use-mcp exec vitest run src/server/tool-lane-hygiene.test.ts --config ./vitest.config.ts
```

Result: passed. 1 test file, 9 tests.

```sh
pnpm -F @proj-airi/computer-use-mcp exec vitest run \
  src/server/tool-lane-hygiene.test.ts \
  src/server/register-tools-coordinate-contract.test.ts \
  src/server/register-tools-pty-approval.test.ts \
  --config ./vitest.config.ts
```

Result: passed. 3 test files, 15 tests.

```sh
pnpm exec moeru-lint --fix \
  services/computer-use-mcp/validation/tool-lane-hygiene.md \
  services/computer-use-mcp/src/server/tool-lane-hygiene.ts \
  services/computer-use-mcp/src/server/tool-lane-hygiene.test.ts \
  services/computer-use-mcp/src/server/register-tools.ts \
  services/computer-use-mcp/src/state.ts
```

Result: passed with 0 warnings and 0 errors when run under Node 24.

```sh
git diff --check
```

Result: passed.

```sh
pnpm -F @proj-airi/computer-use-mcp typecheck
```

Result: failed on existing baseline files outside this change:
- `src/chrome-session-manager.ts`
- `src/chrome-session-manager.test.ts`
- `src/desktop-grounding.ts`

Observed baseline error classes:
- `TS2339` and `TS2353` around `ChromeSessionInfo.ensureOutcome`
- `TS2451` / `TS2304` around duplicated `chromeWindowBounds` and missing `isChromeInFront`

No typecheck errors were reported for the files changed by this patch.
