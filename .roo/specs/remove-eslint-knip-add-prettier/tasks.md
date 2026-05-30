# Tasks: Remove ESLint & Knip, Add Prettier on Pre-Commit

## Task 1: Remove ESLint dependencies from root `package.json`

- [ ] Remove from `devDependencies`: `eslint`, `@antfu/eslint-config`, `@electron-toolkit/eslint-config-ts`, `@moeru/eslint-config`, `eslint-plugin-oxlint`, `@unocss/eslint-config`, `@unocss/eslint-plugin`
- [ ] Remove from `devDependencies`: `oxlint`, `knip`
- [ ] Remove from `scripts`: `"lint": "moeru-lint ."`, `"lint:fix": "moeru-lint --fix ."`, `"knip": "knip"`
- [ ] Add to `devDependencies`: `prettier` (latest stable, via catalog)
- [ ] Add to `scripts`: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`
- [ ] Update `nano-staged` config from `"*": "moeru-lint --fix"` to `"*.{js,ts,mjs,cjs,vue,json,css,scss,html,md,yml,yaml,mts,cts}": "prettier --write"`
- [ ] Keep `simple-git-hooks` config unchanged (`"pre-commit": "pnpm nano-staged"`)

## Task 2: Update `pnpm-workspace.yaml` catalog

- [ ] Remove `@moeru/eslint-config` entry from catalog
- [ ] Remove `knip` entry from catalog
- [ ] Add `prettier` entry to catalog (e.g. `prettier: ^3.6.2` or latest stable)
- [ ] Remove `nano-staged` from catalog if it was only used for linting (check — it's still needed for pre-commit, so keep it)

## Task 3: Delete `knip.json`

- [ ] Delete `knip.json` at root

## Task 4: Create `.prettierrc.json`

- [ ] Create `.prettierrc.json` at root with:
  ```json
  {
    "semi": false,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 120,
    "tabWidth": 2,
    "endOfLine": "lf",
    "arrowParens": "always",
    "htmlWhitespaceSensitivity": "ignore",
    "vueIndentScriptAndStyle": false
  }
  ```

## Task 5: Create `.prettierignore`

- [ ] Create `.prettierignore` at root with:
  ```
  node_modules
  dist
  pnpm-lock.yaml
  *.min.js
  *.min.cjs
  package-lock.json
  ```

## Task 6: Update `cspell.config.yaml`

- [ ] Remove `knip` from the words list

## Task 7: Update `AGENTS.md`

- [ ] Remove references to `eslint`, `eslint.config.js`, `moeru-lint`, `knip` from the document
- [ ] Update lint/format section to reflect: Prettier handles formatting (pre-commit + `pnpm format`), DeepSource handles linting in the cloud, no local lint tool expected
- [ ] Update Commands section: replace `pnpm lint` / `pnpm lint:fix` with `pnpm format` / `pnpm format:check`
- [ ] Add note that `eslint-disable` comments in source are left intact for DeepSource

## Task 8: Update `apps/stage-tamagotchi/electron-builder.config.ts`

- [ ] Remove `.eslintcache` and `eslint.config.ts` from the files ignore list in the electron-builder config

## Task 9: Update `packages/ccc/package.json`

- [ ] Replace `"lint": "eslint ."` with `"format": "prettier --write ."`
- [ ] Replace `"lint:fix": "eslint --fix ."` with `"format:check": "prettier --check ."`

## Task 10: Run `pnpm install` to update lockfile

- [ ] Run `pnpm install` to regenerate `pnpm-lock.yaml` with the removed deps and added `prettier`

## Task 11: Verify Prettier works correctly

- [ ] Run `pnpm format:check` to verify Prettier config is valid and files are mostly already formatted
- [ ] If significant diffs appear, run `pnpm format` once to align, then verify with `pnpm format:check`
- [ ] Verify pre-commit hook works: make a small change, stage it, and confirm `pnpm nano-staged` runs Prettier on the staged file

## Task 12: Verify typecheck still passes

- [ ] Run `pnpm typecheck` to confirm no type errors introduced by the dependency removal
