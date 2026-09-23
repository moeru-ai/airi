import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { Conversation } from '../messages/types'
import type { StreamOptions } from '../types/llm'

/** The selected provider adapter projects context and owns the request lifecycle. */
export interface AgentLLMPort {
  stream: (model: string, provider: GenerationProvider, conversation: Conversation, options?: StreamOptions) => Promise<void>
}
