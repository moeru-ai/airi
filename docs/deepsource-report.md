# DeepSource Issues Report — 2026-06-23

## Summary

| Metric | Value |
|--------|-------|
| Total occurrences | 697 |
| Unique issue types | 21 |
| Analyzers | 1 (javascript) |
| Unique files affected | ~180+ |

## Issues Ranked by Count

| # | Code | Title | Count | Files |
|---|------|-------|-------|-------|
| 1 | JS-R1005 | Function with cyclomatic complexity higher than threshold | 100 | 36 |
| 2 | JS-W1028 | Use default imports for only default exports | 100 | 75 |
| 3 | JS-0116 | `async function` should have `await` expression | 100 | 22 |
| 4 | JS-0321 | Detected empty functions | 100 | 46 |
| 5 | JS-0323 | Detected usage of the `any` type | 100 | 33 |
| 6 | JS-0715 | Disallow unused properties | 32 | 20 |
| 7 | JS-0388 | Bad function overloading | 32 | 1 |
| 8 | JS-R1004 | Useless template literal found | 30 | 13 |
| 9 | JS-0362 | Found interfaces with call signatures | 19 | 19 |
| 10 | JS-W1041 | Found complex boolean return | 15 | 14 |
| 11 | JS-0322 | Detected the declaration of empty interfaces | 13 | 4 |
| 12 | JS-C1001 | Found unnecessarily complex import statement | 12 | 9 |
| 13 | JS-0045 | Either all code paths should have explicit returns, or none | 10 | 5 |
| 14 | JS-0051 | `for-in` loops should include an `if` statement | 8 | 6 |
| 15 | JS-W1029 | Found usage of deprecated name | 7 | 7 |
| 16 | JS-0608 | Duplication of field names is not allowed | 7 | 4 |
| 17 | JS-0356 | Found unused variables in TypeScript code | 3 | 3 |
| 18 | JS-0077 | Assignments to native objects / read-only global variables | 3 | 2 |
| 19 | JS-0327 | Detected the use of classes as namespaces | 2 | 2 |
| 20 | JS-0102 | Prefer var declarations be placed at the top of their scope | 2 | 1 |
| 21 | JS-0246 | Require template literals instead of string concatenation | 2 | 2 |

## Fixes by Batch

### Batch A — High-volume mechanical fixes (safest for agents)
- **JS-R1004** (30): Useless template literal → convert to plain string
- **JS-0116** (100): Add `await` or remove `async` keyword
- **JS-0321** (100): Empty functions → add `// noop` or implement body
- **JS-0322** (13): Empty interfaces → add `// eslint-disable` or remove
- **JS-0246** (2): String concat → template literals
- **JS-0102** (2): Move `var` declarations to top of scope
- **JS-0051** (8): Add guard `if` inside `for-in` loops
- **JS-C1001** (12): Simplify complex import statements
- **JS-0608** (7): Remove duplicated field names
- **JS-0356** (3): Remove unused variables

### Batch B — Type safety
- **JS-0323** (100): Replace `any` with proper types
- **JS-0362** (19): Replace interfaces with call signatures using `type`
- **JS-0077** (3): Stop mutating native/read-only globals

### Batch C — Import/export correctness
- **JS-W1028** (100): Use default imports for default exports
- **JS-0715** (32): Remove unused Vue props / properties
- **JS-W1029** (7): Replace deprecated API names

### Batch D — Logic & structural
- **JS-R1005** (100): Refactor high-cyclomatic-complexity functions
- **JS-W1041** (15): Simplify complex boolean returns
- **JS-0045** (10): Normalize return path consistency
- **JS-0388** (32): Fix bad function overloading (single file: `apps/stage-tamagotchi/src/main/libs/i18n/index.ts`)

## Execution Status

| Batch | Scope | Agent | Status |
|-------|-------|-------|--------|
| A | Mechanical fixes (JS-R1004, JS-0322, JS-0356, JS-0246, JS-0102, JS-0608, JS-0051, JS-C1001, JS-0327) | Subagent 1 | ✅ Done |
| B | Type safety (JS-0323, JS-0362, JS-0077) | Subagent 2 | ✅ Done |
| C | Import/export (JS-W1028, JS-0715, JS-W1029) | Subagent 3 | ✅ Done |
| D1 | async/empty/returns (JS-0116, JS-0321, JS-0045, JS-0388, JS-C1001, JS-0322, JS-0051, JS-0102) | Subagent 4 | ✅ Done |
| D2 | Complexity & boolean (JS-R1005, JS-W1041) | Subagent 5 | ✅ Done |

## Package Distribution

| Package | Occurrences |
|---------|-------------|
| `packages/stage-ui` | 405 |
| `apps/stage-tamagotchi` | 109 |
| `packages/ui` | 29 |
| `packages/stage-pages` | 23 |
| `core/__tests__` | 22 |
| `packages/ui-transitions` | 19 |
| `apps/worker` | 12 |
| `packages/stage-ui-live2d` | 11 |
| `packages/server-sdk` | 8 |
| other | ~67 |
