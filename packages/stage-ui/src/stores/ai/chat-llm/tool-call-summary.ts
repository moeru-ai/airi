import type { Tool } from '@xsai/shared-chat'

import { isPlainObject, omit } from 'es-toolkit'
import { looseObject, parseJson, pipe, safeParse, string } from 'valibot'

/**
 * The argument that the model writes first in every tool call: one line that tells the owner what the call does and
 * why. The recorded call keeps it, so the chat shows it on the row of the call and a new tool card learns the purpose
 * of the call from it. The tool never gets it.
 */
export const CALL_SUMMARY_ARGUMENT = 'call_summary'

const callSummaryProperty = {
  type: 'string',
  // A model that reads the line as words to the user also writes it in the reply, where speech and copy pick it up.
  // So the description calls it a label and keeps it out of the reply.
  description: 'Write this first. A short label shown on this call in the chat: what the call does and why, in the language of your reply. It is not part of your reply, so do not repeat it in your text. No final period.',
}

/**
 * The parameters of a tool with the summary as their first argument. It is the first property, so the model writes it
 * before the other arguments. It is required, because a strict provider rejects a property that is not required.
 *
 * Returns `undefined` for a tool that declares the argument itself, or whose parameters are no object.
 */
function parametersWithSummary(parameters: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!parameters || (parameters.type !== undefined && parameters.type !== 'object'))
    return undefined
  const properties = isPlainObject(parameters.properties) ? parameters.properties : {}
  if (CALL_SUMMARY_ARGUMENT in properties)
    return undefined
  const required = Array.isArray(parameters.required) ? parameters.required : []
  return {
    ...parameters,
    type: 'object',
    properties: { [CALL_SUMMARY_ARGUMENT]: callSummaryProperty, ...properties },
    required: [CALL_SUMMARY_ARGUMENT, ...required],
  }
}

function withoutSummary(input: unknown) {
  return isPlainObject(input) && CALL_SUMMARY_ARGUMENT in input ? omit(input, [CALL_SUMMARY_ARGUMENT]) : input
}

/**
 * Asks the model for a summary in each call of a tool, and keeps it from the tool.
 *
 * Use when:
 * - A tool goes to the chat model. `resolveLlmTools` applies it to every tool.
 *
 * Expects:
 * - xsAI checks the input with `validate` before `execute`, and a rerun calls only `execute`. Both get the input
 *   without the summary, so a strict schema of the tool still accepts it.
 *
 * Returns:
 * - The tool with the summary argument. A tool that declares the argument itself stays as it is.
 */
export function withCallSummary(tool: Tool): Tool {
  const parameters = parametersWithSummary(tool.function?.parameters)
  if (!parameters)
    return tool

  const { validate } = tool
  return {
    ...tool,
    function: { ...tool.function, parameters },
    ...(validate ? { validate: async (input: unknown) => await validate(withoutSummary(input)) } : {}),
    execute: async (input, options) => await tool.execute(withoutSummary(input), options),
  }
}

// A finished call holds its arguments as JSON text, as the model wrote them.
const recordedSummarySchema = pipe(string(), parseJson(), looseObject({ [CALL_SUMMARY_ARGUMENT]: string() }))

/**
 * Reads the summary from the recorded arguments of a call.
 *
 * Returns the summary, or `undefined` when the model wrote none.
 *
 * @example
 * readCallSummary('{"call_summary":"Check the weather in Bangkok","city":"Bangkok"}')
 * // => 'Check the weather in Bangkok'
 */
export function readCallSummary(args: string): string | undefined {
  const recorded = safeParse(recordedSummarySchema, args)
  return recorded.success ? recorded.output[CALL_SUMMARY_ARGUMENT].trim() || undefined : undefined
}
