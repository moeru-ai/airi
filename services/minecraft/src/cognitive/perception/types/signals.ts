export type PerceptionSignalType
  = | 'chat_message'
    | 'entity_attention' // e.g. someone waving, teabagging
    | 'environmental_anomaly' // e.g. sudden loud sound
    | 'saliency_high' // generic high saliency event
    | 'social_gesture' // e.g. teabagging, waving
    | 'social_presence'
    | 'system_message' // e.g. death messages, join/leave

export interface PerceptionSignal {
  type: PerceptionSignalType
  description: string // Textual summary for LLM

  // Contextual Data
  sourceId?: string // Who/What caused this
  confidence?: number // 0-1
  timestamp: number

  // Structured Data (for logic)
  metadata: Record<string, any>
}
