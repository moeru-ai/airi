# @proj-airi/mediapipe-workshop

Single-person motion capture workshop package.

**Goal**

Provide a minimal closed loop that stage-web can consume:

`camera frame` → `MediaPipe Tasks Vision` → `PerceptionState` → `canvas overlay`

**Where to try it**

- Devtools page: `apps/stage-web/src/pages/devtools/mediapipe-workshop.vue`
- Menu entry: Settings → System → Developer → “MediaPipe Workshop”

**Key files**

- `packages/mediapipe-workshop/src/types.ts`: middle-layer contract (`PerceptionState`)
- `packages/mediapipe-workshop/src/engine.ts`: scheduler + dropped-frame policy + state merge
- `packages/mediapipe-workshop/src/backends/mediapipe.ts`: `@mediapipe/tasks-vision` integration
- `packages/mediapipe-workshop/src/overlay.ts`: canvas overlay renderer

**Backend assumptions**

- Single person (`maxPeople: 1`)
- Running mode: `VIDEO`
- Landmarks are normalized (`x`/`y` in `[0..1]`) and drawn onto the overlay canvas

**Docs**

Keep upstream docs/snippets in `packages/mediapipe-workshop/references/`.

The minimal API surface this package uses is summarized in:

- `packages/mediapipe-workshop/references/tasks-vision-api.md`
