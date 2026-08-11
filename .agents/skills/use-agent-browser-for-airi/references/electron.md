# Electron stage-tamagotchi

Build or start stage-tamagotchi with a known CDP port. Prefer a dedicated user-data directory so imported fixtures and onboarding state do not affect the contributor's normal profile.

```bash
APP_REMOTE_DEBUG=true \
APP_REMOTE_DEBUG_PORT=9250 \
APP_REMOTE_DEBUG_NO_OPEN=true \
pnpm dev:tamagotchi
```

If using the built app, launch its Electron executable with `apps/stage-tamagotchi/out/main/index.js` and an explicit `--user-data-dir` under a newly created temporary directory.

## Choose the renderer

Enumerate raw targets first:

```bash
curl -sS http://127.0.0.1:9250/json/list
agent-browser --session airi-electron --cdp 9250 tab
```

Identify the main `/#/` target, switch with its stable `tN` id, verify its URL, set onboarding storage, and close an existing `/onboarding` target.

Expand the main controls and open settings:

```bash
agent-browser --session airi-electron --cdp 9250 snapshot -i
# Replace @eN with the current snapshot ref for Expand.
agent-browser --session airi-electron --cdp 9250 click @eN
agent-browser --session airi-electron --cdp 9250 find role button click --name 'Open settings'
```

Enumerate targets again, switch to the new `/settings` target, and route it to model settings:

```bash
agent-browser --session airi-electron --cdp 9250 eval 'location.hash = "/settings/models"; true'
agent-browser --session airi-electron --cdp 9250 snapshot -i
```

Keep `--session airi-electron --cdp 9250` on every command. Follow the shared import contract in `SKILL.md`.

Live2D validation can open a report modal. If a visible `Confirm` button is covered in the accessibility click path, re-snapshot and resolve the covering dialog first. Use a DOM `.click()` on the exact visible Confirm button only as a diagnostic fallback, and record that ordinary pointer automation did not reach it.

After `Pick`, switch back to the original main target, wait for its canvas, capture it, and inspect errors and console output. Repeat in a fresh temporary profile when isolation between formats matters.
