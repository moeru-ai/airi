# Desktop Lane Status

Updated: 2026-04-14

This note is a factual status memo for the current desktop lane work around PR #1649. It is intentionally narrow: only current state, actual blockers, and what should happen now vs later.

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
- The Chrome extension bridge and iframe offset work are no longer hypothetical:
  - PR #1649 already contains a real extension-side WebSocket client bridge
  - PR #1649 already contains frame offset propagation for iframe DOM candidates

## What is actually still blocking

These are the remaining real issues, ordered by severity.

### 1. Extension unknown actions still return `ok: true`

- File:
  - `/Users/liuziheng/airi-pr1649/services/computer-use-mcp/chrome-extension/background.js`
- Current behavior:
  - unsupported actions fall into `result = { error: ... }`
  - but the response still returns `{ ok: true, result }`
- Why this matters:
  - upper layers can interpret unsupported DOM actions as successful bridge execution
  - that can suppress OS-input fallback even though nothing actually happened
- This is still a real unresolved review blocker.

### 2. Browser-dom click routing still ignores non-default click semantics

- File:
  - `/Users/liuziheng/airi-pr1649/services/computer-use-mcp/src/browser-action-router.ts`
  - called from `/Users/liuziheng/airi-pr1649/services/computer-use-mcp/src/server/register-desktop-grounding.ts`
- Current behavior:
  - `chrome_dom` candidates route to browser-dom if selector + bridge are available
  - routing does not currently incorporate `button` / `clickCount`
- Why this matters:
  - right-click or double-click can still be routed to a DOM path that only performs a standard primary click
- This is not as severe as the first issue, but it is still a real correctness gap.

### 3. Overlay lifecycle / RPC readiness is not fully closed yet

- Files currently being worked on:
  - `/Users/liuziheng/airi-pr1649/apps/stage-tamagotchi/src/main/windows/desktop-overlay/rpc/contracts.ts`
  - `/Users/liuziheng/airi-pr1649/apps/stage-tamagotchi/src/main/windows/desktop-overlay/rpc/index.electron.ts`
  - `/Users/liuziheng/airi-pr1649/apps/stage-tamagotchi/src/renderer/pages/desktop-overlay-polling.ts`
  - `/Users/liuziheng/airi-pr1649/apps/stage-tamagotchi/src/renderer/pages/desktop-overlay-polling.test.ts`
- Current state:
  - there is already a preload-order mitigation in `desktop-overlay/index.ts`
  - there is already a per-call timeout in `desktop-overlay-polling.ts`
  - there is now work-in-progress code for an explicit readiness contract
- Why this is not yet "done":
  - the readiness flow is still uncommitted work
  - the live window context still needs one narrow verification pass
- This is not proven broken today, but it is the most likely remaining runtime risk on the overlay path.

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

1. Fix the extension unknown-action response contract so unsupported actions return `ok: false`.
2. Restrict browser-dom click routing to left single-click only; force OS-input for right-click or multi-click.
3. Finish or explicitly shelve the overlay readiness contract work:
   - if kept, validate it in a live overlay window context before merging
   - if not finished now, do not half-merge it

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
