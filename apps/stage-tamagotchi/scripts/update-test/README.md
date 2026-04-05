# AIRI Electron Updater Local Test Harness

This directory provides a local mocked update-server workflow for Stage Tamagotchi.

It is intended to verify AIRI's refactored updater path:

- explicit `UPDATE_SERVER_URL` override mode
- no GitHub Releases API dependency
- no custom updater cache ownership
- developer-only updater diagnostics inspection

## Files

- `generate-manifest.ts`: generate local `latest-*.yml` metadata and placeholder artifacts
- `start-server.ts`: serve generated fixtures over HTTP
- `setup.sh`: prepare the local fixture directories
- `run-test.sh`: thin orchestration wrapper
- `dev-app-update.local.yml`: optional generic-provider template for development-only experiments

## Quick Start

From the repo root:

```bash
bash apps/stage-tamagotchi/scripts/update-test/setup.sh
pnpm -F @proj-airi/stage-tamagotchi update-test:generate \
  --root scripts/update-test/fixtures/server \
  --channel stable \
  --target aarch64-apple-darwin \
  --version 9.9.9-update-test.1
pnpm -F @proj-airi/stage-tamagotchi update-test:server \
  --port 8787 \
  --root scripts/update-test/fixtures/server
```

Then, in another terminal:

```bash
cd apps/stage-tamagotchi
UPDATE_SERVER_URL=http://127.0.0.1:8787/stable pnpm run dev
```

## Verification Flow

1. Open the About page.
2. Click `Check for updates`.
3. Confirm the update becomes available.
4. Click `Download update`.
5. Confirm the updater reaches the `downloaded` state.
6. Open `Settings > System > Developer`.
7. Enable `Inspect updater diagnostics`.
8. Open `Devtools > Updater`.
9. Confirm:
   - `overrideActive=true`
   - `feedUrl` points to `http://127.0.0.1:8787/stable`
   - `platform`, `arch`, and `channel` match the current runtime

## Helper Wrapper

You can also print the workflow commands with:

```bash
bash apps/stage-tamagotchi/scripts/update-test/run-test.sh
```

Environment variables supported by the wrapper:

- `PORT`
- `CHANNEL`
- `TARGET`
- `VERSION`

Common targets:

- Apple Silicon macOS: `aarch64-apple-darwin`
- Intel macOS: `x86_64-apple-darwin`
- Windows x64: `x86_64-pc-windows-msvc`
- Linux x64: `x86_64-unknown-linux-gnu`

## Notes

- The generated artifact is a placeholder file meant for update discovery and early download flow verification.
- Real signed installer execution remains a separate manual verification step.
- The first pass is manual-first by design. A Playwright `_electron` smoke layer can be added on top later.
- When invoking the package scripts through `pnpm -F @proj-airi/stage-tamagotchi`, treat `--root` as relative to `apps/stage-tamagotchi`, not the workspace root.
