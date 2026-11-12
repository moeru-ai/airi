import type { TimelineSpan } from '../projections/types'

/** What a click, a hover, or a selection points to: a span, an instant, or a state change, by its key. */
export interface TraceItemRef {
  kind: 'span' | 'instant' | 'state'
  key: string
}

/** The state of a pipeline stage instance at a time. */
export type StageStatus = 'idle' | 'busy' | 'error' | string

export interface PipelineNode {
  key: string
  stage: string
  /** The stage label of the profile in the requested locale, or the stage key. */
  label: string
  instance?: string
  status: StageStatus
  /** Open spans of the stage at the time. */
  open: TimelineSpan[]
  /** The trace has a track of the stage. Without one, the status says nothing. */
  observed: boolean
}
