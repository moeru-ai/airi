import type { ContextMessage } from '../types/chat'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  /** Projects context for the identified session. Diagnostic snapshots cannot enter a model request. */
  snapshot: (sessionId: string) => Record<string, ContextMessage[]>
  reset: () => void
}
