import type { ContextMessage } from '../types/chat'
import type { SessionFeatures } from '../types/session-features'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  snapshot: (scope?: { sessionId: string, features: SessionFeatures }) => Record<string, ContextMessage[]>
  reset: () => void
}
