import type { GenerationProtocol } from '../../../schemas/generation-protocol'
import type { GenerationAdapter } from './types'

import { chatCompletionsAdapter } from './chat-completions'
import { responsesAdapter } from './responses'

/** Every advertised protocol must provide a complete wire adapter. */
export const generationAdapters = {
  'chat-completions': chatCompletionsAdapter,
  'responses': responsesAdapter,
} satisfies Record<GenerationProtocol, GenerationAdapter>
