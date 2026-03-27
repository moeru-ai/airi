export const GEN_AI_ATTR_OPERATION_NAME = 'gen_ai.operation.name'
export const GEN_AI_ATTR_REQUEST_MODEL = 'gen_ai.request.model'
export const GEN_AI_ATTR_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens'
export const GEN_AI_ATTR_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens'

export const AIRI_ATTR_BILLING_FLUX_CONSUMED = 'airi.billing.flux_consumed'
export const AIRI_ATTR_GEN_AI_INPUT_MESSAGES = 'airi.gen_ai.input.messages'
export const AIRI_ATTR_GEN_AI_INPUT_TEXT = 'airi.gen_ai.input.text'
export const AIRI_ATTR_GEN_AI_OPERATION_KIND = 'airi.gen_ai.operation.kind'
export const AIRI_ATTR_GEN_AI_OLLAMA_THINK = 'airi.gen_ai.ollama.think'
export const AIRI_ATTR_GEN_AI_OUTPUT_FULL_TEXT = 'airi.gen_ai.output.full_text'
export const AIRI_ATTR_GEN_AI_OUTPUT_TEXT = 'airi.gen_ai.output.text'
export const AIRI_ATTR_GEN_AI_STREAM = 'airi.gen_ai.stream'
export const AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED = 'airi.gen_ai.stream_interrupted'

export const SERVER_ATTR_ADDRESS = 'server.address'
export const SERVER_ATTR_PORT = 'server.port'

export function getServerConnectionAttributes(baseUrl: string): Record<string, string | number> {
  const url = new URL(baseUrl)
  const attributes: Record<string, string | number> = {
    [SERVER_ATTR_ADDRESS]: url.hostname,
  }

  if (url.port) {
    attributes[SERVER_ATTR_PORT] = Number.parseInt(url.port, 10)
  }

  return attributes
}
