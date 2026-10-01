import type { Audience } from '../runtime/audience'
import type { ContextMessage } from '../types/chat'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  /** Projects context for the identified session and run audience. Diagnostic snapshots cannot enter a model request. */
  snapshot: (sessionId: string, audience: Audience) => Record<string, ContextMessage[]>
  reset: () => void
}
