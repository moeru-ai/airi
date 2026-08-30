import type { FetchTransportPort } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection, ModelRuntimeStreamInput } from '../../contracts/model-runtime-port'

import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

import { sanitizeMessages } from '../llm-service'
import { toModelConnectionError } from './errors'
import { createTransportFetch } from './fetch-transport'
import {
  modelRuntimeKey,
  resolveStreamTools,
  streamOptionsContentArrayOkByKey,
  streamOptionsToolsOkByKey,
} from './tools'
import { runXsAiGeneration } from './xsai-lifecycle'

/**
 * Streams OpenAI Chat Completions through `@xsai/stream-text`.
 *
 * The SDK talks to the Fetch Transport Port. The request URL is the resolved
 * generation path, not the SDK default `chat/completions` join.
 */
export async function streamOpenAIChatCompletions(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  input: ModelRuntimeStreamInput,
): Promise<void> {
  const key = modelRuntimeKey(connection.connectionId, input.model)
  const supportsContentArray = streamOptionsContentArrayOkByKey(key, input.options)
  const supportedTools = streamOptionsToolsOkByKey(key, input.options)
  const tools = supportedTools ? await resolveStreamTools(input.options, input.tools) : []
  const fetchImpl = createTransportFetch({
    transport,
    protocol: 'openai-chat-completions',
    operation: 'generate',
    url: connection.generationUrl,
    headers: connection.headers,
    signal: input.options?.abortSignal,
  })

  try {
    await runXsAiGeneration((onEvent) => {
      return streamText({
        baseURL: connection.generationUrl,
        model: input.model,
        messages: sanitizeMessages(input.messages as unknown[], supportsContentArray),
        headers: connection.headers,
        abortSignal: input.options?.abortSignal,
        fetch: fetchImpl,
        streamOptions: { includeUsage: true },
        stopWhen: stepCountAtLeast(10),
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: input.options?.toolChoice,
        ...(input.options?.maxOutputTokens != null
          ? { maxTokens: input.options.maxOutputTokens }
          : {}),
        onEvent,
      })
    }, input.options)
  }
  catch (error) {
    throw toModelConnectionError(error, 'generation')
  }
}
