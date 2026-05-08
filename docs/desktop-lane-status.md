# Desktop Lane Status

Updated: 2026-05-08

This note is a factual status memo for the current desktop lane work in this recut branch. It is intentionally narrow: only current state, actual blockers, and what should happen now vs later.

## What is already true

- The desktop lane direction is stable:
  - macOS only
  - Chrome-first
  - visual + semantic tree + OS input
  - overlay is a visualization layer, not a second system cursor
- The following baselines already exist in code:
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/executors/macos-local.ts`
    - saves the real cursor position and restores it with `CGWarpMouseCursorPosition(...)`
  - `/Users/liuziheng/airi/apps/stage-tamagotchi/src/main/windows/shared/window.ts`
    - `makeWindowPassThrough()` uses ignore-mouse-events + non-focusable overlay behavior
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/browser-dom/cdp-bridge.ts`
    - 5-second heartbeat with teardown after 3 consecutive failures
  - `/Users/liuziheng/airi/services/computer-use-mcp/src/bin/smoke-chrome-grounding.ts`
    - desktop v3 smoke that proves the ensure / observe / click / state chain
- The Chrome extension bridge and iframe offset work are no longer hypothetical:
  - the recut branch already contains a real extension-side WebSocket client bridge
  - the recut branch already contains frame offset propagation for iframe DOM candidates
- The browser-dom route contract is now fail-closed:
  - non-left clicks and multi-clicks stay on OS input
  - `BrowserDomExtensionBridge` rejects `ok: false` responses instead of treating them as success

## What is actually still blocking

These are the remaining real issues, ordered by severity.

### 1. Live desktop v3 smoke exists, but it is baseline coverage, not product support.

- Current smoke proves:
  `desktop_ensure_chrome -> desktop_observe -> desktop_click_target -> desktop_get_state`
- It does not prove Chrome semantic DOM routing, live overlay-window rendering,
  or user-input isolation.

### 2. Overlay lifecycle / RPC readiness still needs a live-window pass on this recut branch.

- Files currently being worked on:
  - `/Users/liuziheng/airi-desktop-recut/apps/stage-tamagotchi/src/main/windows/desktop-overlay/rpc/contracts.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/stage-tamagotchi/src/main/windows/desktop-overlay/rpc/index.electron.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/stage-tamagotchi/src/renderer/pages/desktop-overlay-polling.ts`
  - `/Users/liuziheng/airi-desktop-recut/apps/stage-tamagotchi/src/renderer/pages/desktop-overlay-polling.test.ts`
- Current state:
  - the readiness contract is already wired in `desktop-overlay/rpc/index.electron.ts`
  - the renderer poll controller already waits on readiness and handles degraded state
  - the live window still needs one fresh pass on this recut branch to confirm the runtime proof is current
- This is the remaining runtime risk on the overlay path.

### 3. Local overlay live-window smoke exists in the recut branch, but it still needs a live run on this branch.

- The smoke is now wired in `apps/stage-tamagotchi/package.json` as
  `smoke:desktop-overlay-live-window`.
- The shared candidate-selection helper is unit-tested.
- What is still missing here is a fresh pass on this recut branch with the real
  Electron overlay window, to confirm the heartbeat marker and MCP polling still
  behave the same as the older line.

## What is not a current blocker

These items are real ideas or cleanup work, but they are not the thing that should block the line right now.

- Eager overlay init cleanliness in `apps/stage-tamagotchi/src/main/index.ts`
- Refactoring nested browser-dom routing logic for readability
- Turning `macos-local.ts` into instant-warp-only fallback with zero motion trace
- Rewriting overlay visuals, ghost pointer polish, or extra renderer debug UI

## How to interpret m13v's comments

m13v's comments were useful because they matched the real platform constraints, but they should be split correctly:

- Already aligned with current code:
  - save → act → restore cursor pattern
  - overlay should not intercept user input
  - heartbeat teardown for crashed CDP sessions
- Still useful as future refinement:
  - reducing native motion trace so UI owns more of the visible pointer animation
  - deeper runtime discipline around session lifecycle

In short: m13v gave good runtime advice. That does not mean every suggestion is a current blocker.

## What should happen now

1. No action needed for the extension unknown-action contract; it is already fail-closed.
2. Keep browser-dom routing fail-closed for non-left clicks and bridge errors; this stays covered, not product-supported.
3. Rerun the local overlay live-window smoke on this recut branch before calling it current proof.

## What should happen later

Only after the above is clean:

1. Optional follow-up:
   - `fix(stage-tamagotchi): validate desktop overlay lifecycle and RPC readiness in live window context`
2. Optional follow-up:
   - `refactor(computer-use-mcp): evaluate instant-warp-only macOS fallback against ghost-pointer UX`
3. Optional follow-up:
   - strengthen iframe anchor matching when sibling iframes are highly similar

## Bottom line

The desktop lane is not blocked by direction. It is blocked by a small number of correctness issues and one still-open overlay lifecycle validation step.

Do not reopen architecture. Do not mix in polish. Do not keep piling unrelated changes onto the same PR.
