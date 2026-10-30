/**
 * Copies of the OpenTelemetry GenAI attribute names that trace-kit uses.
 *
 * The `gen_ai.*` names have development stability, so they are only in `@opentelemetry/semantic-conventions/incubating`.
 * The upstream README tells libraries not to import that entry at runtime, but to copy the definitions. Each name
 * here has the name and the value of the upstream export. `semconv.test.ts` compares them with the installed package,
 * so a change upstream fails the tests.
 */

/** The version of `@opentelemetry/semantic-conventions` that the copies follow. Exports write it into their metadata. */
export const SEMCONV_VERSION = '1.43.0' as const

export const ATTR_GEN_AI_OPERATION_NAME = 'gen_ai.operation.name' as const
export const ATTR_GEN_AI_PROVIDER_NAME = 'gen_ai.provider.name' as const
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model' as const
export const ATTR_GEN_AI_RESPONSE_MODEL = 'gen_ai.response.model' as const
export const ATTR_GEN_AI_CONVERSATION_ID = 'gen_ai.conversation.id' as const
export const ATTR_GEN_AI_AGENT_ID = 'gen_ai.agent.id' as const
export const ATTR_GEN_AI_AGENT_NAME = 'gen_ai.agent.name' as const
export const ATTR_GEN_AI_TOOL_NAME = 'gen_ai.tool.name' as const
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id' as const
export const ATTR_GEN_AI_USAGE_INPUT_TOKENS = 'gen_ai.usage.input_tokens' as const
export const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = 'gen_ai.usage.output_tokens' as const
export const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = 'gen_ai.system_instructions' as const
export const ATTR_GEN_AI_INPUT_MESSAGES = 'gen_ai.input.messages' as const
export const ATTR_GEN_AI_OUTPUT_MESSAGES = 'gen_ai.output.messages' as const
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments' as const
export const ATTR_GEN_AI_TOOL_CALL_RESULT = 'gen_ai.tool.call.result' as const

// NOTICE:
// The npm package does not have this attribute yet, so the test cannot compare it.
// The GenAI conventions repository defines it for memory spans, but no npm release has it.
// Source: https://github.com/open-telemetry/semantic-conventions-genai at commit 9ffc7e00c639be7712e544e3e54331e885dccf84.
// Removal condition: when `@opentelemetry/semantic-conventions/incubating` exports it, compare it in the test like the others.
export const ATTR_GEN_AI_MEMORY_QUERY_TEXT = 'gen_ai.memory.query.text' as const
