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
  abortSignal?: AbortSignal
  timeoutMs?: number
}

export interface LLMResult {
  text: string
  reasoning?: string
  // FIXME unsafe type
  usage: any
}

/**
 * Lightweight LLM agent for text generation using xsai
 */
export class LLMAgent {
  constructor(private config: LLMConfig) { }

  private isCerebrasBaseURL(baseURL: string): boolean {
    const normalized = baseURL.toLowerCase()
    return normalized.includes('cerebras.ai') || normalized.includes('cerebras.com')
  }

  private createLinkedAbortController(parentSignal?: AbortSignal): {
    controller: AbortController
    dispose: () => void
  } {
    const controller = new AbortController()
    if (!parentSignal) {
      return {
        controller,
        dispose: () => {},
      }
    }

    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason)
      return {
        controller,
        dispose: () => {},
      }
    }

    const onAbort = () => {
      controller.abort(parentSignal.reason)
    }
    parentSignal.addEventListener('abort', onAbort, { once: true })
    return {
      controller,
      dispose: () => parentSignal.removeEventListener('abort', onAbort),
    }
  }

  /**
   * Call LLM with the given messages
   */
  async callLLM(options: LLMCallOptions): Promise<LLMResult> {
    const shouldSendReasoning = !this.isCerebrasBaseURL(this.config.baseURL)
    const { controller, dispose } = this.createLinkedAbortController(options.abortSignal)
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? Math.floor(options.timeoutMs)
      : null
    const timeoutError = timeoutMs
      ? Object.assign(new Error(`LLM provider call timeout after ${timeoutMs}ms`), { name: 'TimeoutError' })
      : null
    const timeoutHandle = timeoutMs
      ? setTimeout(() => {
          if (!controller.signal.aborted)
            controller.abort(timeoutError)
        }, timeoutMs)
      : undefined

    try {
      const response = await generateText({
        baseURL: this.config.baseURL,
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: options.messages,
        headers: { 'Accept-Encoding': 'identity' },
        abortSignal: controller.signal,
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
    finally {
      if (timeoutHandle)
        clearTimeout(timeoutHandle)
      dispose()
    }
  }
}
