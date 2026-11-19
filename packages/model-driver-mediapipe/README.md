# @proj-airi/model-driver-mediapipe

Single-person motion capture workshop package.

**Goal**

Provide a minimal closed loop that stage-web can consume:

`camera frame` → `MediaPipe Tasks Vision` → `PerceptionState` → `canvas overlay`

**Where to try it**

- Devtools page: `apps/stage-web/src/pages/devtools/model-driver-mediapipe.vue`
- Menu entry: Settings → System → Developer → “MediaPipe Workshop”

**Key files**

- `packages/model-driver-mediapipe/src/types.ts`: middle-layer contract (`PerceptionState`)
- `packages/model-driver-mediapipe/src/engine.ts`: scheduler + dropped-frame policy + state merge
- `packages/model-driver-mediapipe/src/backends/mediapipe.ts`: `@mediapipe/tasks-vision` integration
- `packages/model-driver-mediapipe/src/utils/overlay.ts`: canvas overlay renderer

**Backend assumptions**

- Single person (`maxPeople: 1`)
- Running mode: `VIDEO`
- Landmarks are normalized (`x`/`y` in `[0..1]`) and drawn onto the overlay canvas

**Docs**

Keep upstream docs/snippets in `packages/model-driver-mediapipe/references/`.

The minimal API surface this package uses is summarized in:

- `packages/model-driver-mediapipe/references/tasks-vision-api.md`
