/**
 * [singing] UI-side type re-exports and supplementary types.
 * Core types are defined in @proj-airi/singing/types and re-exported here.
 */

export type {
  CoverJobContract,
} from '@proj-airi/singing/contracts'

export type {
  JobStatus,
  SingingJob,
} from '@proj-airi/singing/types'

/** Job status as displayed in the UI */
export type SingingJobDisplayStatus
  = | 'idle'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'

/** UI form state for creating a cover job */
export interface CoverFormState {
  inputFile: File | null
  mode: 'rvc' | 'seedvc'
  voiceId: string
  referenceFile: File | null
  f0UpKey: number
  indexRate: number
  protect: number
  rmsMixRate: number
  vocalGainDb: number
  instGainDb: number
  ducking: boolean
  targetLufs: number
}
