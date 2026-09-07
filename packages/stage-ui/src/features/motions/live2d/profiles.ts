import type { Pose } from '@proj-airi/model-driver-magic-live2d'

import idleCalmProject from './assets/idle-calm.json'
import speakingExcitedProject from './assets/speaking-excited.json'

/** One normalized Live2D pose in a MAGIC dataset. */
export interface Live2DMotionMagicSample extends Pose {
  /** Elapsed time from the start of the dataset, in milliseconds. */
  atMs: number
}

/** Timestamped Live2D poses that MAGIC can sample and fit. */
export interface Live2DMotionMagicDataset {
  /** Recording schema when the dataset comes from the Live2D motion recorder. */
  format?: 'airi-live2d-motion/v6'
  /** Duration of the source dataset, in milliseconds. */
  durationMs: number
  /** Source poses in ascending timestamp order. */
  samples: readonly Live2DMotionMagicSample[]
}

/** One bundled reference dataset that can fit a MAGIC motion model. */
export interface Live2DMotionMagicProfile {
  /** Stable value stored in Live2D settings. */
  id: string
  /** Dataset used to fit VAR or AR-HMM. */
  dataset: Live2DMotionMagicDataset
}

/** Bundled MAGIC profiles available to Live2D settings. */
export const live2dMotionMagicProfiles = {
  'idle-calm': {
    id: 'idle-calm',
    dataset: {
      format: idleCalmProject.source.format as 'airi-live2d-motion/v6',
      durationMs: idleCalmProject.source.durationMs,
      samples: idleCalmProject.source.samples,
    },
  },
  'speaking-excited': {
    id: 'speaking-excited',
    dataset: {
      format: speakingExcitedProject.source.format as 'airi-live2d-motion/v6',
      durationMs: speakingExcitedProject.source.durationMs,
      samples: speakingExcitedProject.source.samples,
    },
  },
} as const satisfies Record<string, Live2DMotionMagicProfile>

export type Live2DMotionMagicProfileId = keyof typeof live2dMotionMagicProfiles

/** Profile selected when the user has not chosen another bundled dataset. */
export const defaultLive2DMotionMagicProfileId: Live2DMotionMagicProfileId = 'speaking-excited'

/** Dataset selected when initialize receives no dataset. */
export const defaultLive2DMotionMagicDataset = live2dMotionMagicProfiles[defaultLive2DMotionMagicProfileId].dataset
