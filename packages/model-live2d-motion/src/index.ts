/** A normalized pose that procedural motion models can fit and generate. */
export interface Live2DMotionPose {
  eyeX: number
  eyeY: number
  /** Squint amount from 0 (open) to 1 (closed). */
  eyeSquint: number
  headX: number
  headY: number
  /** Head roll from -1 (left) to 1 (right). */
  headZ: number
  bodyX: number
  bodyY: number
  /** Body roll from -1 (left) to 1 (right). */
  bodyZ: number
  /** Mouth shape from -1 to 1. */
  mouthForm: number
  /** Mouth opening from 0 (closed) to 1 (open). */
  mouthOpen: number
  /** Horizontal model translation from -1 to 1. */
  offsetX: number
  /** Vertical model translation from -1 to 1. */
  offsetY: number
}

/** Pose axes used by fitting, filtering, and rendering integrations. */
export const live2dMotionPoseAxes = [
  'eyeX',
  'eyeY',
  'eyeSquint',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyY',
  'bodyZ',
  'mouthForm',
  'mouthOpen',
  'offsetX',
  'offsetY',
] as const satisfies readonly (keyof Live2DMotionPose)[]

/** A pose with every normalized axis at its neutral value. */
export const neutralLive2DMotionPose: Readonly<Live2DMotionPose> = Object.freeze({
  eyeX: 0,
  eyeY: 0,
  eyeSquint: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  bodyX: 0,
  bodyY: 0,
  bodyZ: 0,
  mouthForm: 0,
  mouthOpen: 0,
  offsetX: 0,
  offsetY: 0,
})

/** A fixed-rate pose sequence that is ready for model fitting. */
export interface Live2DMotionTrainingSequence {
  /** Sampling cadence of `poses`, in frames per second. */
  sampleRateHz: number
  /** Duration of the source before fixed-rate sampling, in milliseconds. */
  sourceDurationMs: number
  /** Fixed-rate poses in time order. */
  poses: readonly Live2DMotionPose[]
}

/** Controls that can change between generated frames. */
export interface Live2DMotionPredictOptions {
  /** Scale of the sampled model noise. @default 1 */
  noiseScale?: number
}

/** Options that initialize one independent predictor state. */
export interface Live2DMotionPredictorOptions {
  /** Seed for predictor history and random sampling. */
  seed: number
}

/** One generated pose and optional model-specific state. */
export interface Live2DMotionPrediction<TState = undefined> {
  pose: Live2DMotionPose
  state: TState
}

/** A stateful, seeded stream of fixed-rate Live2D motion predictions. */
export interface Live2DMotionPredictor<TState = undefined> {
  /** Generation cadence in frames per second. */
  readonly sampleRateHz: number
  /** Advances model history by one frame. */
  next: (options?: Live2DMotionPredictOptions) => Live2DMotionPrediction<TState>
}
