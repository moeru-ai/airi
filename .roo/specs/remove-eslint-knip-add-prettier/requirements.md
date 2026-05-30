# Requirements: Remove ESLint & Knip, Add Prettier on Pre-Commit

## Problem Statement

ESLint and Knip are causing more trouble than value in this monorepo:

- **Knip** previously deleted legitimate dependencies across multiple `package.json` files (commit `9c1fcc7` — "fix: restore all package.json dependencies removed by overly aggressive knip cleanup"). Its false positives require constant config tweaking and have already caused real damage.
- **ESLint** (via `moeru-lint` which pipes `oxlint` → `eslint`) adds significant devDependency weight, requires `eslint-disable` comments scattered across ~39 source files, and its rules frequently conflict with the codebase patterns. The `@moeru/eslint-config`, `@antfu/eslint-config`, `@electron-toolkit/eslint-config-ts`, `eslint-plugin-oxlint`, `@unocss/eslint-config`, `@unocss/eslint-plugin` packages together form a complex lint stack that is hard to maintain.
- **DeepSource** cloud linter already handles the "dirty work" of catching real issues in CI, making the local ESLint+Knip stack redundant for actual bug prevention.

The pre-commit hook currently runs `moeru-lint --fix` on all staged files via `nano-staged`. This should be replaced with Prettier formatting only — keeping commits visually consistent without the overhead and risk of a full lint+dead-code pass.

## Requirements

### R1: Remove ESLint and all related dependencies

Remove from root `package.json` devDependencies:

- `eslint`
- `@antfu/eslint-config`
- `@electron-toolkit/eslint-config-ts`
- `@moeru/eslint-config`
- `eslint-plugin-oxlint`
- `@unocss/eslint-config`
- `@unocss/eslint-plugin`

Remove from root `package.json` scripts:

- `lint` (`moeru-lint .`)
- `lint:fix` (`moeru-lint --fix .`)

Remove from `pnpm-workspace.yaml` catalog:

- `@moeru/eslint-config`

Remove any `eslint.config.*` files if they exist at root or in sub-packages.

Remove `packages/ccc/package.json` `lint` and `lint:fix` scripts that reference `eslint .`.

Remove `apps/stage-tamagotchi/electron-builder.config.ts` reference to `.eslintcache` and `eslint.config.ts` in the files ignore list.

### R2: Remove Knip and all related config

Remove from root `package.json`:

- `knip` devDependency
- `"knip": "knip"` script

Remove from `pnpm-workspace.yaml` catalog:

- `knip` entry

Delete `knip.json` config file at root.

Remove `knip` from `cspell.config.yaml` words list if present.

### R3: Leave eslint-disable comments as-is

Do NOT remove `eslint-disable` comments from source files. DeepSource cloud linter may read and respect these directives, so they should remain intact even after the local ESLint tooling is removed. The ~39 `eslint-disable` comments across the monorepo are harmless and may continue to serve a purpose for DeepSource analysis.

### R4: Add Prettier as a direct devDependency

Add `prettier` to root `package.json` devDependencies (latest stable version).

Create a `.prettierrc.json` config file at root with sensible defaults aligned with the existing codebase style (matching current `@antfu/eslint-config` output):

- Single quotes
- No semicolons
- 2-space indent
- Trailing commas (all)
- Print width 120
- Vue, TypeScript, HTML, CSS, YAML, Markdown support via built-in parsers

Create a `.prettierignore` file that excludes:

- `node_modules/`
- `dist/`
- `*.min.js`
- `pnpm-lock.yaml`
- `package.json` (pnpm manages formatting of these)
- Auto-generated files (e.g. `typed-router.d.ts`)

Add `prettier` to `pnpm-workspace.yaml` catalog for workspace consistency.

### R5: Update pre-commit hook to run Prettier

Update `package.json` `nano-staged` config from:

```json
"*": "moeru-lint --fix"
```

to:

```json
"*.{js,ts,mjs,cjs,vue,json,css,scss,html,md,yml,yaml}": "prettier --write"
```

Keep `simple-git-hooks` config as-is (`"pre-commit": "pnpm nano-staged"`).

### R6: Update AGENTS.md

Remove references to ESLint, `moeru-lint`, `eslint.config.js`, and `knip` from `AGENTS.md`.

Update the lint section to reflect that:

- Prettier handles formatting (pre-commit + manual `pnpm format`)
- DeepSource handles linting in the cloud
- No local lint tool is expected

Add a `format` script to root `package.json`: `"format": "prettier --write ."` and `"format:check": "prettier --check ."`.

Update the "Commands" section to replace `pnpm lint` / `pnpm lint:fix` with `pnpm format` / `pnpm format:check`.

### R7: No CI changes needed

The CI workflow (`ci.yml`) does not run lint or knip — only build, test, and typecheck. No changes to CI are required. DeepSource runs as an external cloud analyzer and is unaffected by this change.

## Out of Scope

- Changing DeepSource configuration or rules
- Adding new lint tools (e.g. oxlint standalone) — DeepSource covers this
- Refactoring code that was only structured to satisfy ESLint rules
- Updating VS Code settings/extensions recommendations (can be a follow-up)
