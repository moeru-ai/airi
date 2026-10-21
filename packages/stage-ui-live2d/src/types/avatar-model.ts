import type { AvatarModelReference } from '@proj-airi/core-character'

/** Stores the controls that a Live2D Avatar Model does not expose. */
export interface Live2DControlPolicy {
  /** Exact expression names that the runtime rejects. */
  disabledExpressions: string[]
  /** Exact motion file names that the runtime rejects. */
  disabledMotions: string[]
}

/** Character-owned configuration for one Live2D avatar-model reference. */
export interface Live2DAvatarModelConfig {
  /** Selects the expressions and motions that the Agent can use. */
  controls: Live2DControlPolicy
}

/** References one Live2D display model from a character definition. */
export type Live2DAvatarModelReference = AvatarModelReference<'live2d', Live2DAvatarModelConfig>
