import type {
  Category,
  FaceLandmarker,
  FaceLandmarkerResult,
  HandLandmarker,
  HandLandmarkerResult,
  Landmark,
  NormalizedLandmark,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'

import type { MediaPipeAssetsConfig, MocapBackend, MocapConfig, MocapJob, PerceptionPartial } from '../types'

type TasksVisionModule = typeof import('@mediapipe/tasks-vision')
type VisionFileset = Awaited<ReturnType<TasksVisionModule['FilesetResolver']['forVisionTasks']>>

export const DEFAULT_MEDIAPIPE_ASSETS: MediaPipeAssetsConfig = {
  wasmRoot: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  modelAssetPath: {
    pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
}

export function createMediaPipeBackend(
  assets: MediaPipeAssetsConfig = DEFAULT_MEDIAPIPE_ASSETS,
): MocapBackend {
  let busy = false
  let config: MocapConfig | undefined
  let tasksVision: TasksVisionModule | undefined
  let vision: VisionFileset | undefined

  let poseLandmarker: PoseLandmarker | undefined
  let handLandmarker: HandLandmarker | undefined
  let faceLandmarker: FaceLandmarker | undefined

  async function init(nextConfig: MocapConfig) {
    config = nextConfig

    if (!tasksVision)
      tasksVision = await import('@mediapipe/tasks-vision')

    if (!vision) {
      const { FilesetResolver } = tasksVision
      vision = await FilesetResolver.forVisionTasks(assets.wasmRoot)
    }
  }

  function isBusy() {
    return busy
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker)
      return poseLandmarker

    const { PoseLandmarker } = tasksVision!
    poseLandmarker = await PoseLandmarker.createFromOptions(vision!, {
      baseOptions: { modelAssetPath: assets.modelAssetPath.pose },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

    return poseLandmarker
  }

  async function ensureHandLandmarker() {
    if (handLandmarker)
      return handLandmarker

    const { HandLandmarker } = tasksVision!
    handLandmarker = await HandLandmarker.createFromOptions(vision!, {
      baseOptions: { modelAssetPath: assets.modelAssetPath.hands },
      runningMode: 'VIDEO',
      numHands: 2,
    })

    return handLandmarker
  }

  async function ensureFaceLandmarker() {
    if (faceLandmarker)
      return faceLandmarker

    const { FaceLandmarker } = tasksVision!
    faceLandmarker = await FaceLandmarker.createFromOptions(vision!, {
      baseOptions: { modelAssetPath: assets.modelAssetPath.face },
      runningMode: 'VIDEO',
      numFaces: 1,
    })

    return faceLandmarker
  }

  async function run(frame: TexImageSource, jobs: MocapJob[], nowMs: number): Promise<PerceptionPartial> {
    if (!config)
      throw new Error('MediaPipe backend not initialized (call init() first)')

    busy = true
    try {
      const partial: PerceptionPartial = {}

      for (const job of jobs) {
        if (!config.enabled[job])
          continue

        if (job === 'pose') {
          const landmarker = await ensurePoseLandmarker()
          const res: PoseLandmarkerResult = landmarker.detectForVideo(frame, nowMs)
          const firstPose: NormalizedLandmark[] = res.landmarks[0] ?? []
          const firstWorld: Landmark[] = res.worldLandmarks[0] ?? []
          partial.pose = {
            landmarks2d: firstPose,
            worldLandmarks: firstWorld.map(p => ({
              x: p.x,
              y: p.y,
              z: p.z,
              visibility: p.visibility,
              presence: p.presence,
            })),
          }
        }
        else if (job === 'hands') {
          const landmarker = await ensureHandLandmarker()
          const res: HandLandmarkerResult = landmarker.detectForVideo(frame, nowMs)
          const landmarks: NormalizedLandmark[][] = res.landmarks ?? []
          const handedness: Category[][] = res.handedness ?? []

          partial.hands = landmarks.map((lm, i) => {
            const mostLikelyCategory = handedness[i]?.[0]
            const categoryName = mostLikelyCategory?.categoryName
            const score = mostLikelyCategory?.score
            const handed = categoryName === 'Left' || categoryName === 'Right' ? categoryName : 'Right'
            return {
              handedness: handed,
              landmarks2d: lm,
              score,
            }
          })
        }
        else if (job === 'face') {
          const landmarker = await ensureFaceLandmarker()
          const res: FaceLandmarkerResult = landmarker.detectForVideo(frame, nowMs)
          const firstFace: NormalizedLandmark[] = res.faceLandmarks?.[0] ?? []
          partial.face = {
            hasFace: firstFace.length > 0,
            landmarks2d: firstFace,
          }
        }
      }

      return partial
    }
    finally {
      busy = false
    }
  }

  return {
    init,
    isBusy,
    run,
  }
}
