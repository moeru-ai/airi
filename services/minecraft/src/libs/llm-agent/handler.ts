import type { NeuriContext } from 'neuri'
import type { ChatCompletion, Message } from 'neuri/openai'

import type { Logger } from '../../utils/logger'
import type { LLMConfig, LLMResponse } from './types'

import { withRetry } from '@moeru/std'

import { config } from '../../composables/config'
import { useLogger } from '../../utils/logger'

export abstract class BaseLLMHandler {
  protected logger: Logger

  constructor(protected config: LLMConfig) {
    this.logger = useLogger()
  }

  protected async handleCompletion(
    context: NeuriContext,
    route: string,
    messages: Message[],
  ): Promise<LLMResponse> {
    const completion = await context.reroute(route, messages, {
      model: this.config.model ?? config.openai.model,
    }) as ChatCompletion | ChatCompletion & { error: { message: string } }

    if (!completion || 'error' in completion) {
      this.logger.withFields(context).error('Completion failed')
      throw new Error(completion?.error?.message ?? 'Unknown error')
    }

    const content = await completion.firstContent()
    this.logger.withFields({ usage: completion.usage, content }).log('Generated content')

    return {
      content,
      usage: completion.usage,
    }
  }

  protected createRetryHandler<T>(handler: (context: NeuriContext) => Promise<T>) {
    return withRetry<NeuriContext, T>(handler, {
      retry: this.config.retryLimit ?? 3,
      retryDelay: this.config.delayInterval ?? 1000,
    })
  }
}
