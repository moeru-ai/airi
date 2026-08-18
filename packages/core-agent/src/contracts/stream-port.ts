import type { StreamingAssistantMessage } from '../types/chat'

export interface AgentForegroundStreamPort {
  patch: (message: StreamingAssistantMessage) => void
  reset: () => void
}
