import type { FetchTransportPort } from '../../contracts/fetch-transport-port'
import type {
  ModelGenerationValidationResult,
  ModelRuntimeConnection,
  ModelRuntimePort,
  ModelRuntimeStreamInput,
  ModelRuntimeValidationInput,
} from '../../contracts/model-runtime-port'

import { streamAnthropicMessages } from './anthropic-messages'
import { discoverModelsWithTransport } from './discovery'
import { secretValuesFromHeaders, toModelConnectionError } from './errors'
import { streamOpenAIChatCompletions } from './openai-chat-completions'
import { streamOpenAIResponses } from './openai-responses'

const VALIDATION_MAX_OUTPUT_TOKENS = 16

/**
 * Creates a protocol-neutral runtime for one Custom Model connection snapshot.
 *
 * The runtime uses the connection protocol for every request. It never retries
 * another protocol after an error.
 */
export function createCustomModelRuntime(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
): ModelRuntimePort {
  return {
    protocol: connection.protocol,
    stream: input => streamWithProtocol(connection, transport, input),
    discover: input => discoverModelsWithTransport(connection, transport, input),
    validateGeneration: input => validateGenerationWithRuntime(
      connection,
      transport,
      input,
    ),
  }
}

async function streamWithProtocol(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  input: ModelRuntimeStreamInput,
): Promise<void> {
  switch (connection.protocol) {
    case 'openai-chat-completions':
      await streamOpenAIChatCompletions(connection, transport, input)
      return
    case 'openai-responses':
      await streamOpenAIResponses(connection, transport, input)
      return
    case 'anthropic-messages':
      await streamAnthropicMessages(connection, transport, input)
      return
    default: {
      const protocol: never = connection.protocol
      throw toModelConnectionError(
        new TypeError(`Unsupported protocol: ${String(protocol)}`),
        'config',
      )
    }
  }
}

async function validateGenerationWithRuntime(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  input: ModelRuntimeValidationInput,
): Promise<ModelGenerationValidationResult> {
  try {
    await streamWithProtocol(connection, transport, {
      model: input.model,
      messages: [{ role: 'user', content: 'ping' }],
      options: {
        abortSignal: input.abortSignal,
        supportsTools: false,
        maxOutputTokens: VALIDATION_MAX_OUTPUT_TOKENS,
      },
    })
    return { success: true }
  }
  catch (error) {
    return {
      success: false,
      error: toModelConnectionError(
        error,
        'generation',
        secretValuesFromHeaders(connection.headers),
      ).toJSON(),
    }
  }
}
