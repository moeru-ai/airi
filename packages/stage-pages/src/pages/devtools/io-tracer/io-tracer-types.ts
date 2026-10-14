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
  { subsystem: IOSubsystems.KWS, label: 'Wake Word', color: '#ec4899', bgColor: '#ec489918', icon: 'i-lucide:bell-ring' },
  { subsystem: IOSubsystems.VoiceInput, label: 'Voice Input', color: '#6366f1', bgColor: '#6366f118', icon: 'i-lucide:audio-waveform' },
  { subsystem: IOSubsystems.VAD, label: 'VAD', color: '#f59e0b', bgColor: '#f59e0b18', icon: 'i-lucide:activity' },
  { subsystem: IOSubsystems.ASR, label: 'ASR', color: '#3b82f6', bgColor: '#3b82f618', icon: 'i-lucide:mic' },
  { subsystem: IOSubsystems.EndJudge, label: 'End Judge', color: '#f97316', bgColor: '#f9731618', icon: 'i-lucide:scale' },
  { subsystem: IOSubsystems.Rephrase, label: 'Rephrase', color: '#14b8a6', bgColor: '#14b8a618', icon: 'i-lucide:pen-line' },
  { subsystem: IOSubsystems.LLM, label: 'LLM', color: '#a855f7', bgColor: '#a855f718', icon: 'i-lucide:brain' },
  { subsystem: IOSubsystems.StreamingControl, label: 'Streaming Control', color: '#06b6d4', bgColor: '#06b6d418', icon: 'i-lucide:radio-tower' },
  { subsystem: IOSubsystems.TTS, label: 'TTS', color: '#22c55e', bgColor: '#22c55e18', icon: 'i-lucide:audio-lines' },
  { subsystem: IOSubsystems.Playback, label: 'Playback', color: '#f87171', bgColor: '#f8717118', icon: 'i-lucide:play' },
]

export const SUBSYSTEM_CONFIG_MAP = new Map(SUBSYSTEM_CONFIGS.map(c => [c.subsystem, c]))

/** Subsystems that run before the LLM in a spoken turn. The chart draws them above the LLM rows, in start order. */
export const INPUT_SUBSYSTEMS: ReadonlySet<IOSubsystem> = new Set([
  IOSubsystems.KWS,
  IOSubsystems.VoiceInput,
  IOSubsystems.VAD,
  IOSubsystems.ASR,
  IOSubsystems.EndJudge,
  IOSubsystems.Rephrase,
])

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
