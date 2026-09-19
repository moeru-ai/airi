import type { ContextMessage } from '../types/chat'

export interface AgentContextPort {
  ingest: (envelope: ContextMessage) => void
  snapshot: () => Record<string, ContextMessage[]>
  /** Deletes one active context bucket by its stable source key. */
  remove: (sourceKey: string) => void
  reset: () => void
}
