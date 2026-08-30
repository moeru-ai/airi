import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { StreamOptions } from '../types/llm'

/**
 * xsAI ChatProvider stream port used by the current agent call chain.
 *
 * Custom Model connections use {@link import('./model-runtime-port').ModelRuntimePort}.
 * Do not route those connections through this port.
 */
export interface AgentLLMPort {
  stream: (model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) => Promise<void>
}
