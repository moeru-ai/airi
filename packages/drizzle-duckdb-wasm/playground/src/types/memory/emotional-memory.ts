export interface EmotionalMemoryItem {
  // Basic memory properties
  id: string
  score: number
  decayed_score: number
  updated_at: string
  last_retrieved_at: string
  retrieval_count: number

  // Emotional components
  joy_score: number
  aversion_score: number

  // Timing information
  updated_at_str?: string
  last_retrieved_str?: string
  age_in_seconds: number
  time_since_retrieval: number

  // Memory status factors
  ltm_factor?: number // Long-term memory factor (0-1)

  // Optional calculated components for display
  age_in_days?: number
  effective_score?: number
}

export interface EmotionalRetrievalModifiers {
  joyModifier: number
  aversionModifier: number
}
