import type { ContextMessage } from '../types/chat'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  snapshot: () => Record<string, ContextMessage[]>
  reset: () => void
}
