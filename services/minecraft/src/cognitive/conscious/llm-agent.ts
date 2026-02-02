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

    /**
     * Call LLM with the given messages
     */
    async callLLM(options: LLMCallOptions): Promise<LLMResult> {
        const response = await generateText({
            baseURL: this.config.baseURL,
            apiKey: this.config.apiKey,
            model: this.config.model,
            messages: options.messages,
            ...(options.responseFormat && { responseFormat: options.responseFormat }),
        })

        return {
            text: response.text ?? '',
            reasoning: (response as any).reasoning,
            usage: response.usage,
        }
    }
}
