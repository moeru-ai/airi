import type { IOSubsystem } from '@proj-airi/stage-shared'

import { IOSubsystems } from '@proj-airi/stage-shared'

export interface SubsystemConfig {
  bgColor: string
  color: string
  icon: string
  label: string
  subsystem: IOSubsystem
}

export const SUBSYSTEM_CONFIGS: SubsystemConfig[] = [
  { bgColor: '#3b82f618', color: '#3b82f6', icon: 'i-lucide:mic', label: 'ASR', subsystem: IOSubsystems.ASR },
  { bgColor: '#a855f718', color: '#a855f7', icon: 'i-lucide:brain', label: 'LLM', subsystem: IOSubsystems.LLM },
  { bgColor: '#06b6d418', color: '#06b6d4', icon: 'i-lucide:radio-tower', label: 'Streaming Control', subsystem: IOSubsystems.StreamingControl },
  { bgColor: '#22c55e18', color: '#22c55e', icon: 'i-lucide:audio-lines', label: 'TTS', subsystem: IOSubsystems.TTS },
  { bgColor: '#f8717118', color: '#f87171', icon: 'i-lucide:play', label: 'Playback', subsystem: IOSubsystems.Playback },
]

export const SUBSYSTEM_CONFIG_MAP = new Map(SUBSYSTEM_CONFIGS.map(c => [c.subsystem, c]))

/** Height of one span row in pixels */
export const ROW_HEIGHT = 28
/** Height of subsystem group header */
export const SUBSYSTEM_HEADER_HEIGHT = 24
/** Height of a collapsible turn header */
export const TURN_HEADER_HEIGHT = 36
/** Vertical padding inside each row for the span bar */
export const ROW_PADDING = 4
/** Width of the left label column */
export const LABEL_COL_WIDTH = 140
/** Height of the time axis ruler */
export const TIME_AXIS_HEIGHT = 28
/** Height of the minimap */
export const MINIMAP_HEIGHT = 32

/** Gap detection threshold: gaps longer than this (ms) are highlighted */
export const GAP_WARN_THRESHOLD_MS = 100
