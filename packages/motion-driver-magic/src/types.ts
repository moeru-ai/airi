/** A fixed-width frame of normalized motion values. */
export type MotionValues = readonly number[]

/** A fixed-rate motion sequence that is ready for model fitting. */
export interface TrainingSequence {
  /** Sampling cadence of `frames`, in frames per second. */
  sampleRateHz: number
  /** Duration of the source before fixed-rate sampling, in milliseconds. */
  sourceDurationMs: number
  /** Fixed-width frames in time order. */
  frames: readonly MotionValues[]
}

/** The mathematical method used to fit a motion model. */
export type Method = 'ar-hmm' | 'var'

/** Controls that can change between generated frames. */
export interface GenerateOptions {
  /** Scale of the sampled model noise. @default 1 */
  noiseScale?: number
}

/** Options that initialize one independent generator. */
export interface GeneratorOptions {
  /** Seed for generator history and random sampling. */
  seed: number
}

/** One generated motion frame and its method-specific state. */
export interface Frame<TState = undefined> {
  /** Generated normalized motion values. */
  values: number[]
  /** Method-specific state after this frame. */
  state: TState
}

/** One stateful, seeded stream of fixed-rate motion frames. */
export interface Generator<TState = undefined> {
  /** Generation cadence in frames per second. */
  readonly sampleRateHz: number
  /** Advances the generator by one frame. */
  next: (options?: GenerateOptions) => Frame<TState>
}

/** A reusable model produced by one motion method. */
export interface Model<
  TMethod extends Method,
  TState,
  TDiagnostics,
> {
  /** Mathematical method that produced this model. */
  readonly method: TMethod
  /** Generation cadence in frames per second. */
  readonly sampleRateHz: number
  /** Stable measurements from the fit. */
  readonly diagnostics: Readonly<TDiagnostics>
  /** Creates an independent generator without changing this model. */
  toGenerator: (options: GeneratorOptions) => Generator<TState>
}
