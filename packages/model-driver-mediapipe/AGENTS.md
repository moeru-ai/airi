# model-driver-mediapipe Agent Notes

Scope: `packages/model-driver-mediapipe/**`

## Intent

This package is an experimental single-person mocap pipeline for stage-web devtools.

`camera frame` → `@mediapipe/tasks-vision` → `PerceptionState` → `overlay`

## Style / Conventions

- Prefer functional programming (FP) and pure functions where practical.
  - This package overrides the root `AGENTS.md` rule on classes. Use factory functions and closures for stateful modules (example: `createMocapEngine()`).
  - Use a class only to extend a browser API, or when an external library requires one.
- Keep the backend boundary clean:
  - The engine and the scheduler must not import `@mediapipe/tasks-vision`.
  - MediaPipe specifics live under `src/backends/`.
- Keep types stable and narrow:
  - Stage consumers depend on `src/types.ts` as the contract.
  - This package overrides the root `AGENTS.md` rule on backward compatibility. New fields in `src/types.ts` must be optional, so that existing consumers keep working.

## Key Files

- `src/types.ts`: middle-layer contract (`PerceptionState`, config types)
- `src/engine.ts`: scheduling + dropped-frame policy + partial merge (FP)
- `src/backends/mediapipe.ts`: MediaPipe Tasks Vision adapter (sync `detectForVideo`)
- `src/overlay.ts`: debug overlay renderer (points + connectors)
- `references/tasks-vision-api.md`: minimal upstream API notes

## Performance Notes

- `detectForVideo()` is synchronous. Do not block the UI:
  - Engine drops frames when backend reports `isBusy()`.
  - Scheduler controls per-task rates (`hz`) to cap work.
