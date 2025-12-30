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

export const visionTaskWasmRoot = new URL('./assets/wasm', import.meta.url).href
