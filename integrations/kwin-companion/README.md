# Experimental KWin companion boundary

This directory contains an optional native transport, script exchange, and mock-compositor prototype.
The C++ helper compiles against Qt6 Core and DBus. It is not an installed or verified desktop integration.
No application imports this code. No setup command changes a desktop.

## What it tests

- Explicit enable and terminal disable
- Logical desktop pointer samples across outputs, with scale metadata and layout revisions
- Stale samples, negative origins, portrait output bounds, display seams, and gaps
- One enrolled AIRI window per session
- D-Bus caller identity checks against trusted transport metadata
- Process birth identity, window recreation, owner changes, and revocation
- Bounded geometry requests, compositor readback, deadlines, and cancellation
- Work-area checks before geometry writes
- Shutdown, signal cleanup, delivery failure, and parent lease expiry

## What remains unavailable

KWin packaging, proven native enrollment, and Electron integration are not implemented.
The helper source validates real D-Bus caller metadata. Its private-bus integration tests remain blocked in the current execution environment.
The prototype does not establish that its supplied window belongs to AIRI. The future trusted enrollment path must establish that fact.
Caller metadata in TypeScript tests is a fixture. Do not treat those tests as proof of real bus authentication.

The movement prototype stays inside the window's current output work area.
Cross-output travel, recovery placement after hotplug, stacking, input regions, and edge peeking remain separate work.
Output changes stop the session. Reconnection requires a fresh binding and explicit enable.

Keep native Wayland global pointer and positioning capabilities unavailable until live verification passes.
Keep Electron DIP samples separate from KWin logical samples.
The existing explicit XWayland fallback remains unchanged.

## Files

- `src/protocol.ts`: central Eventa contracts, strict geometry input validation, and coordinate projection
- `src/caller-scope.ts`: immutable caller scope and process identity revocation
- `src/kwin-api.ts`: minimal typed KWin boundary
- `src/companion-session.ts`: single-surface state machine
- `src/script-exchange.ts`: bounded KWin D-Bus exchange and independent native timer lease
- `src/enrollment-gate.ts`: main-registry authorization boundary that rejects missing native evidence
- `native/`: optional Qt6 helper, protocol utilities, and default-off CMake target
- `native-build.md`: native build recipe, private pipe contract, and verification status
- `tests/`: mocked external signals, geometry readback, and protocol tests
- `design.md`: transport proposal, trust boundaries, integration contract, and release gates

## Run local checks

Run from the repository root with its existing development dependencies available.
These commands do not install a helper or contact a desktop.

```sh
node_modules/.bin/vitest run --config integrations/kwin-companion/vitest.config.ts
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck integrations/kwin-companion/src/*.ts integrations/kwin-companion/tests/*.ts integrations/kwin-companion/vitest.config.ts
node_modules/.bin/eslint integrations/kwin-companion
```

The TypeScript command uses the TypeScript 6 `--ignoreConfig` flag for this isolated prototype.
Do not treat these checks as a full application build or live KWin test.

## Dependencies

The prototype uses existing Eventa, Valibot, TypeScript, and Vitest dependencies.
It adds no npm package manifest, lockfile entry, or automatic installation flow.
The default-off native target requires Qt6 Core and DBus development packages on the build machine.
Packaging and desktop enablement remain separate decisions.
