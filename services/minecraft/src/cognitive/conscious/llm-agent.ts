import type { Message } from '@xsai/shared-chat'

import { generateText } from '@xsai/generate-text'

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMCallOptions {
  messages: Message[]
  responseFormat?: { type: 'json_object' }
  reasoning?: { effort: 'low' | 'medium' | 'high' }
}

export interface LLMResult {
  text: string
  reasoning?: string
  usage: any
}

/**
 * Lightweight LLM agent for text generation using xsai
 */
export class LLMAgent {
  constructor(private config: LLMConfig) { }

  private isCerebrasBaseURL(baseURL: string): boolean {
    return true // TODO: REMOVE ME
    const normalized = baseURL.toLowerCase()
    return normalized.includes('cerebras.ai') || normalized.includes('cerebras.com')
  }

  /**
   * Call LLM with the given messages
   */
  async callLLM(options: LLMCallOptions): Promise<LLMResult> {
    const shouldSendReasoning = !this.isCerebrasBaseURL(this.config.baseURL)
    const response = await generateText({
      baseURL: this.config.baseURL,
      apiKey: this.config.apiKey,
      model: this.config.model,
      messages: options.messages,
      headers: { 'Accept-Encoding': 'identity' },
      ...(options.responseFormat && { responseFormat: options.responseFormat }),
      ...(shouldSendReasoning && {
        // Enable reasoning with configurable effort (default: low)
        reasoning: options.reasoning ?? { effort: 'low' },
      }),
    } as Parameters<typeof generateText>[0])

    return {
      text: response.text ?? '',
      reasoning: (response as any).reasoningText,
      usage: response.usage,
    }
  }
}
