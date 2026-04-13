export const IOSubsystems = {
  ASR: 'asr',
  LLM: 'llm',
  TTSChunking: 'tts-chunking',
  TTSSynthesis: 'tts-synthesis',
  Playback: 'playback',
} as const

export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

export interface IOSpan {
  id: string
  traceId: string
  parentSpanId?: string
  startTs: number
  endTs?: number

  ttsCorrelationId?: string
  subsystem: IOSubsystem
  name: string
  meta: Record<string, any>
}

export interface IOTurn {
  id: string
  startTs: number
  endTs?: number
  inputText?: string
  outputText?: string
  spans: IOSpan[]
}
