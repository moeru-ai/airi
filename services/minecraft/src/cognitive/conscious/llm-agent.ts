import type { Message } from '@xsai/shared-chat'

import { streamText } from '@xsai/stream-text'

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMCallOptions {
  messages: Message[]
  responseFormat?: { type: 'json_object' }
  onTextDelta?: (text: string) => void | Promise<void>
  onFinish?: (event: { usage: any }) => void | Promise<void>
}

export interface LLMResult {
  text: string
  usage: any
}

/**
 * Lightweight LLM agent for streaming text generation
 */
export class LLMAgent {
  private fullText = ''

  get text(): string {
    return this.fullText
  }

  constructor(
    private config: LLMConfig,
  ) {}

  /**
   * Call LLM with streaming support
   */
  async callLLM(options: LLMCallOptions): Promise<LLMResult> {
    this.fullText = ''
    let usage: any

    try {
      const response = streamText({
        baseURL: this.config.baseURL,
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: options.messages,
        responseFormat: options.responseFormat,
      })

      for await (const chunk of response.textStream) {
        this.fullText += chunk
        if (options.onTextDelta) {
          await options.onTextDelta(chunk)
        }
      }

      usage = await response.usage

      if (options.onFinish) {
        await options.onFinish({ usage })
      }
    }
    catch (error) {
      throw error
    }

    return {
      text: this.fullText,
      usage,
    }
  }
}
