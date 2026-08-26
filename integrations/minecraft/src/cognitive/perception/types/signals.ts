export interface PerceptionSignal {
  confidence?: number // 0-1
  description: string // Textual summary for LLM

  // Structured Data (for logic)
  // FIXME unsafe type
  metadata: Record<string, any>
  // Contextual Data
  sourceId?: string // Who/What caused this
  timestamp: number

  type: PerceptionSignalType
}

export type PerceptionSignalType
  = | 'airi_command' // instruction from AIRI via spark:command
    | 'airi_context' // context update from AIRI via context:update
    | 'chat_message'
    | 'entity_attention' // e.g. someone waving, punching
    | 'environmental_anomaly' // e.g. sudden loud sound
    | 'saliency_high' // generic high-priority event (e.g. damage)
    | 'social_gesture' // e.g. waving
    | 'social_presence'
    | 'system_message' // e.g. death messages, join/leave
