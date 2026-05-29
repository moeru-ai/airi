# Design: Knip Cleanup

## Architecture

This is a configuration and dependency cleanup task — no application architecture changes are needed. The changes are confined to:

1. `knip.json` (root workspace Knip configuration)
2. `packages/stage-layouts/package.json` (exports field)
3. Multiple `package.json` files (adding/removing dependencies)

## Change Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Root knip.json                        │
│                                                         │
│  1. Fix stage-ui entry: "src/index.ts!" → remove !      │
│     (no src/index.ts exists; Knip should auto-detect    │
│      from package.json exports)                         │
│                                                         │
│  2. Remove ui-transitions entries (redundant,           │
│     auto-detected)                                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              packages/stage-layouts/package.json         │
│                                                         │
│  3. Verify exports field — the ViewControls glob        │
│     pattern is valid but may need adjustment            │
│     if Knip misinterprets it                            │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Dependency Additions (pnpm add -D)          │
│                                                         │
│  4a. stage-tamagotchi: jsdom                            │
│  4b. stage-ui: jsdom, unocss                            │
│  4c. ui-transitions: unocss                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Dependency Removals (pnpm remove)           │
│                                                         │
│  5a. stage-tamagotchi: @date-fns/utc,                   │
│      @formkit/auto-animate, replicate, nprogress,       │
│      posthog-js                                         │
│  5b. stage-layouts: animejs, posthog-js, dompurify      │
│  5c. stage-pages: posthog-js, d3                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Verification                               │
│                                                         │
│  6. pnpm install → pnpm knip → confirm reduction       │
│     from 172 unused files                               │
└─────────────────────────────────────────────────────────┘
```

## Detailed Design

### D1: `packages/stage-ui` Entry Point Fix

**Root cause:** `knip.json` specifies `"src/index.ts!"` for `packages/stage-ui`, but `packages/stage-ui/src/index.ts` does not exist. The package's `exports` in `package.json` maps `"."` to `"./src/components/index.ts"`.

**Fix:** Remove the `src/index.ts!` entry from the `packages/stage-ui` workspace config in `knip.json`. The `src/**/*.story.vue` and `stories/setup.ts` entries should also be removed since they are not needed as Knip entries — Knip traces imports from the package's `exports` field, and story files are dev-only artifacts.

**Resulting config for `packages/stage-ui`:**
```json
"packages/stage-ui": {}
```

This lets Knip rely on auto-detection from `package.json` `exports`.

### D2: `packages/ui-transitions` Redundant Entries

**Root cause:** `knip.json` explicitly lists `src/index.ts!` and `playground/src/main.ts` for `ui-transitions`, but Knip already auto-detects these.

**Fix:** Remove the entire `ui-transitions` entry from the workspaces config, letting Knip auto-detect.

**Resulting config for `ui-transitions`:**
```json
"ui-transitions": {}
```

Or remove the key entirely.

### D3: `packages/stage-layouts` Package Entry

**Root cause:** The `exports` field in `packages/stage-layouts/package.json` contains:
```json
"./components/ViewControls/*": "./src/components/Layouts/ViewControls/*.vue"
```

Knip may be interpreting one of these export patterns as a package entry. The hint says `ViewControls/**/*.vue ... Package entry file not found`.

**Investigation needed:** Check if Knip is picking up the `exports` key pattern as a file glob. The export keys use `ViewControls/*` which maps to `.vue` files — this should be valid. The issue may be that Knip is looking for a concrete file matching the pattern at the package root level.

**Fix:** If the exports are correct (they appear to be — they map subpaths to `.vue` files), the Knip config may need an explicit `entry` override or the exports may need to be adjusted. After fixing D1 and D2, re-run Knip to see if this hint resolves itself. If not, add an explicit entry configuration for `stage-layouts` pointing to `src/index.ts`.

### D4: Unlisted Dependencies

**`jsdom`:** Used in test files via `@vitest-environment jsdom` comment directive in:
- `apps/stage-tamagotchi/src/renderer/stores/chat-sync.test.ts`
- `packages/stage-ui/src/components/scenarios/chat/composables/use-chat-history-scroll.test.ts`

Both workspaces need `jsdom` in `devDependencies`.

**`unocss`:** Imported as `uno.css` (virtual module provided by the `unocss` package) in:
- `packages/stage-ui/stories/setup.ts`
- `packages/ui-transitions/playground/src/main.ts`

Both workspaces need `unocss` in `devDependencies`.

### D5: Unused Dependency Removal

All listed dependencies have been confirmed as having zero imports in their respective workspaces. They can be safely removed with `pnpm remove`.

**Note on `posthog-js`:** This appears in three workspaces (`stage-tamagotchi`, `stage-layouts`, `stage-pages`) and is flagged as unused in all three. However, `packages/stage-ui` also has `posthog-js` in its dependencies — verify it's actually unused there too before removing (it may be used transitively through `stores/analytics/posthog`).

### D6: Verification Strategy

After all changes:

1. Run `pnpm install` to update the lockfile.
2. Run `pnpm knip` and compare the unused file count against the baseline of 172.
3. Run `pnpm lint` and `pnpm typecheck` on affected workspaces to ensure no regressions.
