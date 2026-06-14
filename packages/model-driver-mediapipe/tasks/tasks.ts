export interface VisionTaskAssets {
  pose: string
  hands: string
  face: string
}

export const visionTaskAssets: VisionTaskAssets = {
  pose: new URL('./assets/pose_landmarker_lite.task', import.meta.url).href,
  hands: new URL('./assets/hand_landmarker.task', import.meta.url).href,
  face: new URL('./assets/face_landmarker.task', import.meta.url).href,
}

// NOTICE: Vite production builds only rewrite `new URL('file', import.meta.url)` for
// individual files, not directories. MediaPipe's FilesetResolver.forVisionTasks() needs
// a directory URL to fetch multiple wasm files by name at runtime. We serve them from
// `public/mediapipe-wasm/` so they are available at a stable, unhashed path.
// `import.meta.env` is Vite-only; fall back to '/' for Node.js (e.g. prepare-tasks.ts).
const baseUrl = import.meta.env?.BASE_URL ?? '/'
export const visionTaskWasmRoot = `${baseUrl}mediapipe-wasm`
