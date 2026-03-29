/**
 * @proj-airi/singing
 *
 * AI singing voice conversion pipeline for AIRI.
 * Provides the core logic for cover generation, voice training,
 * and artifact management.
 *
 * @example
 * ```ts
 * import { createCoverJob } from '@proj-airi/singing'
 * import type { CreateCoverRequest } from '@proj-airi/singing/types'
 * ```
 */

export * from './adapters'
export * from './application'
export * from './calibration/calibration.types'
export * from './constants'
export * from './contracts'
export * from './domain'
export * from './evaluation/evaluation.types'
export * from './manifests'
export * from './pipeline'
export * from './presets'
export * from './types/job'
export * from './utils'
export * from './workers'
