import type { Message } from '@xsai/shared-chat'

import { generateText } from '@xsai/generate-text'

export interface LLMCallOptions {
  abortSignal?: AbortSignal
  messages: Message[]
  reasoning?: { effort: 'high' | 'low' | 'medium' }
  responseFormat?: { type: 'json_object' }
  timeoutMs?: number
}

export interface LLMConfig {
  apiKey: string
  baseURL: string
  model: string
}

export interface LLMResult {
  reasoning?: string
  text: string
  // FIXME unsafe type
  usage: any
}

/**
 * Lightweight LLM agent for text generation using xsai
 */
export class LLMAgent {
  constructor(private config: LLMConfig) { }

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
        abortSignal: controller.signal,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        headers: { 'Accept-Encoding': 'identity' },
        messages: options.messages,
        model: this.config.model,
        ...(options.responseFormat && { responseFormat: options.responseFormat }),
        ...(shouldSendReasoning && {
          // Enable reasoning with configurable effort (default: low)
          reasoning: options.reasoning ?? { effort: 'low' },
        }),
      } as Parameters<typeof generateText>[0])

      return {
        reasoning: (response as any).reasoningText,
        text: response.text ?? '',
        usage: response.usage,
      }
    }
    finally {
      if (timeoutHandle)
        clearTimeout(timeoutHandle)
      dispose()
    }
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

  private isCerebrasBaseURL(baseURL: string): boolean {
    const normalized = baseURL.toLowerCase()
    return normalized.includes('cerebras.ai') || normalized.includes('cerebras.com')
  }
}
