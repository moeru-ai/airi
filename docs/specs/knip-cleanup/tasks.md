# Tasks: Knip Cleanup

## Phase 1: Fix Knip Configuration (High Leverage)

- [ ] **T1: Fix `packages/stage-ui` entry in `knip.json`**
  - Remove `"src/index.ts!"` from the `packages/stage-ui` workspace entry in `knip.json` (the file does not exist).
  - Also remove `"src/**/*.story.vue"` and `"stories/setup.ts"` since these are dev-only artifacts; Knip should trace from `package.json` `exports`.
  - Result: `"packages/stage-ui": {}`

- [ ] **T2: Remove redundant entries for `packages/ui-transitions` in `knip.json`**
  - Remove `"src/index.ts!"` and `"playground/src/main.ts"` from the `packages/ui-transitions` workspace entry.
  - Result: `"ui-transitions": {}` or remove the key entirely.

- [ ] **T3: Investigate and fix `packages/stage-layouts` package entry hint**
  - Run `pnpm knip` after T1 and T2 to see if the `ViewControls/**/*.vue` hint resolves.
  - If the hint persists, add an explicit entry in `knip.json` for `stage-layouts` pointing to `src/index.ts`, or verify the `exports` field in `packages/stage-layouts/package.json` is correct.

## Phase 2: Resolve Unlisted Dependencies (Easy Wins)

- [ ] **T4: Add `jsdom` to `devDependencies`**
  ```bash
  pnpm --filter stage-tamagotchi add -D jsdom
  pnpm --filter stage-ui add -D jsdom
  ```

- [ ] **T5: Add `unocss` to `devDependencies`**
  ```bash
  pnpm --filter stage-ui add -D unocss
  pnpm --filter ui-transitions add -D unocss
  ```

- [ ] **T6: Add `uno.css` to `ignoreDependencies` in root `knip.json`**
  - Add `"ignoreDependencies": ["uno.css"]` to the root `knip.json`.
  - `uno.css` is a virtual module provided by the `unocss` Vite plugin and cannot be resolved by Knip's dependency tracer.
  - This silences the remaining 2 unlisted dependency warnings.

## Phase 3: Remove Unused Dependencies

- [ ] **T7: Remove unused dependencies from `apps/stage-tamagotchi`**
  ```bash
  pnpm --filter stage-tamagotchi remove \
    @date-fns/utc \
    @formkit/auto-animate \
    replicate \
    nprogress \
    posthog-js
  ```

- [ ] **T8: Remove unused dependencies from `packages/stage-layouts`**
  ```bash
  pnpm --filter stage-layouts remove \
    animejs \
    posthog-js \
    dompurify
  ```

- [ ] **T9: Remove unused dependencies from `packages/stage-pages`**
  ```bash
  pnpm --filter stage-pages remove \
    posthog-js \
    d3
  ```

## Phase 4: Prune Unused Catalog Entries

- [ ] **T10: Remove 41 unused catalog entries from `pnpm-workspace.yaml`**
  - Open `pnpm-workspace.yaml` and remove the following entries from the `catalog:` section:
    `@ax-llm/ax`, `@better-auth/oauth-provider`, `@capacitor/android`, `@capacitor/app`, `@capacitor/barcode-scanner`, `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/local-notifications`, `@electric-sql/pglite`, `@hono/node-ws`, `@iconify-json/line-md`, `@iconify-json/logos`, `@iconify-json/material-symbols`, `@iconify-json/mdi`, `@iconify-json/ph`, `@iconify-json/tabler`, `@napi-rs/image`, `@proj-airi/unplugin-drizzle-orm-migrations`, `@takumi-rs/image-response`, `@types/ws`, `cac`, `capacitor-native-settings`, `crossws`, `date-fns`, `drizzle-kit`, `drizzle-valibot`, `hono-rate-limiter`, `isolated-vm`, `jose`, `meow`, `node-pty`, `ofetch`, `posthog-node`, `reka-ui`, `stockfish`, `tinyexec`, `tsx`, `uncrypto`, `vue-router`, `yaml`
  - Do NOT modify the `catalogs:` named sections (`vitest`, `xsai`), `catalogMode`, `ignoredBuiltDependencies`, `onlyBuiltDependencies`, `overrides`, or `packageExtensions`.
  - Run `pnpm install` afterward to confirm no dependency resolution errors.

## Phase 5: Verification

- [ ] **T11: Run `pnpm install` to update lockfile**
  - Ensure all dependency additions, removals, and catalog prunes are reflected.

- [ ] **T12: Run `pnpm knip` and compare results**
  - Confirm unused file count has decreased from the baseline of 172.
  - Confirm no `uno.css` unlisted dependency warning.
  - Confirm no `ViewControls/**/*.vue` package entry error.
  - Confirm no new Knip hints or errors are introduced.

- [ ] **T13: Run typecheck and lint on affected workspaces**
  ```bash
  pnpm -F @proj-airi/stage-tamagotchi typecheck
  pnpm -F @proj-airi/stage-ui typecheck
  pnpm -F @proj-airi/stage-layouts typecheck
  pnpm -F @proj-airi/stage-pages typecheck
  pnpm -F @proj-airi/ui-transitions typecheck
  pnpm lint
  ```
  - Confirm no regressions.
