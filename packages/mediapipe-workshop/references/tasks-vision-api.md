# MediaPipe Tasks Vision (minimal API notes)

This package targets `@mediapipe/tasks-vision` (web, JS/TS).

## Core init

```ts
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const vision = await FilesetResolver.forVisionTasks(wasmRoot)
const pose = await PoseLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: poseModelUrl },
  runningMode: 'VIDEO',
  numPoses: 1,
})
```

## Video inference

MediaPipe Tasks Vision `detectForVideo()` runs synchronously and can block the main thread.

```ts
const nowMs = performance.now()
const res = pose.detectForVideo(videoEl, nowMs)
```

## Result shapes (single-person usage)

### Pose

- `res.landmarks`: `NormalizedLandmark[][]` (take `[0]` for single person)
- each landmark includes `{ x, y, z, visibility?, presence? }` with `x/y` in `[0..1]`

### Hands

- `res.landmarks`: `NormalizedLandmark[][]` (each entry is 21 landmarks for one hand)
- `res.handedness`: `Category[][]` aligned with `landmarks`
  - `handedness[i][0].categoryName` is typically `'Left' | 'Right'`
  - `handedness[i][0].score` is confidence

### Face (optional)

- `res.faceLandmarks`: `NormalizedLandmark[][]` (468 landmarks, heavy)
- For the workshop we treat this as presence-only by default.
