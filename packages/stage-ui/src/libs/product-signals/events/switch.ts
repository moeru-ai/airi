import type { StageEnvironment } from '@proj-airi/stage-shared'

import { defineEvent } from '../utils/dsl'

/** Control identifiers are static product names, never labels, paths, or user-provided identifiers. */
export interface TrackSwitchEvent {
  control: string
  checked: boolean
}

export const switchToggledEvent = defineEvent<TrackSwitchEvent & { environment: StageEnvironment }>('switch_toggled')
