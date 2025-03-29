export interface MemoryItem {
  id: string
  score: number
  updated_at: string // ISO timestamp
  last_retrieved_at: string // ISO timestamp
  retrieval_count: number
  updated_at_str: string
  last_retrieved_str: string
  age_in_seconds: number
  time_since_retrieval: number
  ltm_factor?: number // Optional since it's only present when longTermMemoryEnabled is true
  decayed_score: number
}
