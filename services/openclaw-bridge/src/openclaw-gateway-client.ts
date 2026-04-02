import type {
  OpenClawGatewayClientOptions,
  OpenClawGatewayRequest,
  OpenClawTaskResult,
} from './types'

import { errorMessageFrom } from '@moeru/std'

interface GatewayResponsesApiResponse {
  output?: Array<{
    content?: Array<{
      text?: string
      type?: string
    }>
  }>
  output_text?: string
}

interface GatewayChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const LEADING_SLASH_PATTERN = /^\//
const TRAILING_SLASH_PATTERN = /\/?$/
const CHAT_COMPLETIONS_ENDPOINT = '/v1/chat/completions'

function joinUrl(baseUrl: string, endpoint: string): string {
  return new URL(endpoint.replace(LEADING_SLASH_PATTERN, ''), `${baseUrl.replace(TRAILING_SLASH_PATTERN, '/')}`).toString()
}

function extractTextPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const responsesPayload = payload as GatewayResponsesApiResponse
  if (typeof responsesPayload.output_text === 'string' && responsesPayload.output_text.length > 0) {
    return responsesPayload.output_text
  }

  const nestedText = responsesPayload.output
    ?.flatMap(item => item.content ?? [])
    .map(item => item.text)
    .find((value): value is string => typeof value === 'string' && value.length > 0)

  if (nestedText) {
    return nestedText
  }

  const chatPayload = payload as GatewayChatCompletionsResponse
  const chatText = chatPayload.choices
    ?.map(choice => choice.message?.content)
    .find((value): value is string => typeof value === 'string' && value.length > 0)

  return chatText
}

function normalizeResult(payload: unknown): OpenClawTaskResult {
  const text = extractTextPayload(payload)

  if (text) {
    try {
      const parsed = JSON.parse(text) as { summary?: string, structuredOutput?: Record<string, unknown> }
      return {
        summary: parsed.summary ?? text,
        structuredOutput: parsed.structuredOutput ?? parsed,
        rawOutput: payload,
      }
    }
    catch {
      return {
        summary: text,
        rawOutput: payload,
      }
    }
  }

  return {
    summary: 'OpenClaw returned a response without a text summary.',
    rawOutput: payload,
  }
}

export class OpenClawGatewayClient {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly endpoint: string
  private readonly requestTimeoutMs: number

  constructor(private readonly options: OpenClawGatewayClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.endpoint = options.endpoint ?? CHAT_COMPLETIONS_ENDPOINT
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000
  }

  async delegateTask(request: OpenClawGatewayRequest, abortSignal?: AbortSignal): Promise<OpenClawTaskResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort(new Error(`OpenClaw request timed out after ${this.requestTimeoutMs}ms`))
    }, this.requestTimeoutMs)

    const stopForwarding = this.forwardAbort(abortSignal, controller)

    try {
      const response = await this.fetchImpl(joinUrl(this.options.baseUrl, this.endpoint), {
        method: 'POST',
        headers: {
          'authorization': this.options.apiKey ? `Bearer ${this.options.apiKey}` : '',
          'content-type': 'application/json',
          'x-openclaw-scopes': 'operator.write',
        },
        body: JSON.stringify(this.createBody(request)),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`OpenClaw gateway request failed with ${response.status} ${response.statusText}`)
      }

      const payload = await response.json()
      return normalizeResult(payload)
    }
    catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason
        if (reason instanceof Error) {
          throw reason
        }

        throw new DOMException(errorMessageFrom(reason) ?? 'OpenClaw request aborted', 'AbortError')
      }

      throw error
    }
    finally {
      clearTimeout(timeout)
      stopForwarding()
    }
  }

  private createBody(request: OpenClawGatewayRequest) {
    if (this.endpoint === CHAT_COMPLETIONS_ENDPOINT) {
      return {
        model: this.options.model,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              type: 'airi_openclaw_delegated_task',
              task: request,
            }),
          },
        ],
        max_tokens: 1024,
        metadata: {
          taskId: request.taskId,
          source: request.source,
          userId: request.userId,
          conversationId: request.conversationId,
          returnMode: request.returnMode,
        },
      }
    }

    return {
      model: this.options.model,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                type: 'airi_openclaw_delegated_task',
                task: request,
              }),
            },
          ],
        },
      ],
      metadata: {
        taskId: request.taskId,
        source: request.source,
        userId: request.userId,
        conversationId: request.conversationId,
        returnMode: request.returnMode,
      },
    }
  }

  private forwardAbort(sourceSignal: AbortSignal | undefined, targetController: AbortController): () => void {
    if (!sourceSignal) {
      return () => {}
    }

    if (sourceSignal.aborted) {
      targetController.abort(sourceSignal.reason)
      return () => {}
    }

    const onAbort = () => {
      targetController.abort(sourceSignal.reason)
    }

    sourceSignal.addEventListener('abort', onAbort, { once: true })

    return () => {
      sourceSignal.removeEventListener('abort', onAbort)
    }
  }
}
