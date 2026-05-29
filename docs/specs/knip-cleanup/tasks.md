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

## Phase 2: Install Unlisted Dependencies (Easy Wins)

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

## Phase 3: Remove Unused Dependencies

- [ ] **T6: Remove unused dependencies from `apps/stage-tamagotchi`**
  ```bash
  pnpm --filter stage-tamagotchi remove \
    @date-fns/utc \
    @formkit/auto-animate \
    replicate \
    nprogress \
    posthog-js
  ```

- [ ] **T7: Remove unused dependencies from `packages/stage-layouts`**
  ```bash
  pnpm --filter stage-layouts remove \
    animejs \
    posthog-js \
    dompurify
  ```

- [ ] **T8: Remove unused dependencies from `packages/stage-pages`**
  ```bash
  pnpm --filter stage-pages remove \
    posthog-js \
    d3
  ```

## Phase 4: Verification

- [ ] **T9: Run `pnpm install` to update lockfile**
  - Ensure all dependency additions and removals are reflected.

- [ ] **T10: Run `pnpm knip` and compare results**
  - Confirm unused file count has decreased from the baseline of 172.
  - Confirm no new Knip hints or errors are introduced.

- [ ] **T11: Run typecheck and lint on affected workspaces**
  ```bash
  pnpm -F @proj-airi/stage-tamagotchi typecheck
  pnpm -F @proj-airi/stage-ui typecheck
  pnpm -F @proj-airi/stage-layouts typecheck
  pnpm -F @proj-airi/stage-pages typecheck
  pnpm -F @proj-airi/ui-transitions typecheck
  pnpm lint
  ```
  - Confirm no regressions.
