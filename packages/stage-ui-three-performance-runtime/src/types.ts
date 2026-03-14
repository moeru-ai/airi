// Core event/timeline contracts for the performance runtime; kept UI-agnostic so
// adapters (VRM, audio, devtools) can build on top without pulling stage-ui in.

export type PerformanceEventKind = 'speech' | 'viseme' | 'expression' | 'body' | 'marker'

export interface SpeechEventPayload {
  text: string
  buffer?: AudioBuffer
  durationMs?: number
  special?: string | null
}

export interface VisemeEventPayload {
  id: string
  weight?: number
  durationMs?: number
}

export interface ExpressionEventPayload {
  name: string
  weight?: number
  durationMs?: number
}

export interface BodyEventPayload {
  clip: string
  fadeMs?: number
  durationMs?: number
}

export interface MarkerEventPayload {
  key: string
}

interface PerformanceEventPayloadMap {
  speech: SpeechEventPayload
  viseme: VisemeEventPayload
  expression: ExpressionEventPayload
  body: BodyEventPayload
  marker: MarkerEventPayload
}

export type PerformanceEventPayload = PerformanceEventPayloadMap[keyof PerformanceEventPayloadMap]

export interface PerformanceEvent<T extends PerformanceEventKind = PerformanceEventKind> {
  id: string
  kind: T
  t: number // milliseconds since timeline start
  payload: PerformanceEventPayloadMap[T]
}

export interface PerformanceTrack {
  id: string
  type: PerformanceEventKind
  events: PerformanceEvent[]
}

export interface PerformanceTimeline {
  id: string
  lengthMs?: number
  tracks: PerformanceTrack[]
}

export interface SchedulerHandlers {
  onSpeechStart?: (event: PerformanceEvent<'speech'>) => void
  onSpeechEnd?: (event: PerformanceEvent<'speech'>) => void
  onViseme?: (event: PerformanceEvent<'viseme'>) => void
  onExpression?: (event: PerformanceEvent<'expression'>) => void
  onBody?: (event: PerformanceEvent<'body'>) => void
  onMarker?: (event: PerformanceEvent<'marker'>) => void
}
