# model-driver-mediapipe Agent Notes

Scope: `packages/model-driver-mediapipe/**`

## Intent

This package is an experimental single-person mocap pipeline for stage-web devtools.

`camera frame` → `@mediapipe/tasks-vision` → `PerceptionState` → `overlay`

## Style / Conventions

- Prefer functional programming (FP) and pure functions where practical.
  - Use factory functions + closures for stateful modules (example: `createMocapEngine()`).
  - Avoid classes unless extending browser APIs or required by external libraries.
- Keep the backend boundary clean:
  - Engine/scheduler should not import `@mediapipe/tasks-vision`.
  - MediaPipe specifics live under `src/backends/`.
- Keep types stable and narrow:
  - Stage consumers depend on `src/types.ts` as the contract.
  - New fields should be optional and backwards compatible.

## Key Files

- `src/types.ts`: middle-layer contract (`PerceptionState`, config types)
- `src/engine.ts`: scheduling + dropped-frame policy + partial merge (FP)
- `src/backends/mediapipe.ts`: MediaPipe Tasks Vision adapter (sync `detectForVideo`)
- `src/overlay.ts`: debug overlay renderer (points + connectors)
- `references/tasks-vision-api.md`: minimal upstream API notes

## Performance Notes

- `detectForVideo()` is synchronous; avoid blocking UI:
  - Engine drops frames when backend reports `isBusy()`.
  - Scheduler controls per-task rates (`hz`) to cap work.
