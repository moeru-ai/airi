import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { ConversationContext } from '../messages/types'
import type { StreamOptions } from '../types/llm'

/** The selected provider adapter projects context and owns the request lifecycle. */
export interface AgentLLMPort {
  stream: (model: string, provider: GenerationProvider, context: ConversationContext, options?: StreamOptions) => Promise<void>
}
