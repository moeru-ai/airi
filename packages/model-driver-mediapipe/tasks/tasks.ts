export interface VisionTaskAssets {
  face: string
  hands: string
  pose: string
}

export const visionTaskAssets: VisionTaskAssets = {
  face: new URL('./assets/face_landmarker.task', import.meta.url).href,
  hands: new URL('./assets/hand_landmarker.task', import.meta.url).href,
  pose: new URL('./assets/pose_landmarker_lite.task', import.meta.url).href,
}

export const visionTaskWasmRoot = new URL('./assets/wasm', import.meta.url).href
