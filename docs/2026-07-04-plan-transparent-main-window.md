## Plan: transparent-main-window

Small focused change to make the Tauri main window frameless and transparent so the Live2D character floats over the desktop with no background rectangle.

### Change 1 — `apps/stage-tauri/tauri.conf.json`
Set the main window to `transparent: true` and `decorations: false`.

### Change 2 — `apps/stage-tauri/src/styles.css`
Replace the dark `#151515` background on `:root`, `body`, `.shell` with `background: transparent` so the page canvas clears to the OS compositor. Keep the status-panel translucent backdrop as-is.

### Files NOT changed
- `tauri.conf.json` `alwaysOnTop: true` (keep), dimensions (keep).
- `App.vue`, Rust, eventa contracts — no touch. Renderer already reads lifecycle state, so it is independent of background fill.

### Verification
- `cd apps/stage-tauri && cargo build` (exit 0).
- `cd apps/stage-tauri && bash init.sh` (exit 0).
- Visual: the Tauri stage window still renders Live2D character, but the surrounding area is transparent (no black/white rectangle).

### Then commit + push new branch
- Branch: `vi70x4/feat/transparent-main-window` (already created).
- Commit message: `feat(stage-tauri): transparent undecorated main window`.
- Push to origin, open PR into main, but do NOT merge yet.