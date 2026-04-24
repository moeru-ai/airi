import type { IOSubsystem } from '@proj-airi/stage-shared'

import { IOSubsystems } from '@proj-airi/stage-shared'

export interface SubsystemConfig {
  subsystem: IOSubsystem
  label: string
  color: string
  bgColor: string
  icon: string
}

export const SUBSYSTEM_CONFIGS: SubsystemConfig[] = [
  { subsystem: IOSubsystems.ASR, label: 'ASR', color: '#3b82f6', bgColor: '#3b82f618', icon: 'i-lucide:mic' },
  { subsystem: IOSubsystems.LLM, label: 'LLM', color: '#a855f7', bgColor: '#a855f718', icon: 'i-lucide:brain' },
  { subsystem: IOSubsystems.TTS, label: 'TTS', color: '#22c55e', bgColor: '#22c55e18', icon: 'i-lucide:audio-lines' },
  { subsystem: IOSubsystems.Playback, label: 'Playback', color: '#f87171', bgColor: '#f8717118', icon: 'i-lucide:play' },
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
