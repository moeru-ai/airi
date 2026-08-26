import type { ContextMessage } from '../types/chat'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  reset: () => void
  snapshot: () => Record<string, ContextMessage[]>
}
