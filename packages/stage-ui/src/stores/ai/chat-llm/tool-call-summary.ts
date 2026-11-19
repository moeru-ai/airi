import type { Tool } from '@xsai/shared-chat'

import { isPlainObject, omit } from 'es-toolkit'
import { array, fallback, looseObject, optional, parseJson, pipe, safeParse, string } from 'valibot'

/**
 * The arguments that the model writes first in every tool call: one line that tells the owner what the call does and
 * why, and the icon of that line. The recorded call keeps them, so the chat shows them on the row of the call, and a
 * new tool card learns the purpose of the call from the line. The tool never gets them.
 */
export const CALL_SUMMARY_ARGUMENT = 'call_summary'
export const CALL_ICON_ARGUMENT = 'call_icon'

const summaryProperties = {
  [CALL_SUMMARY_ARGUMENT]: {
    type: 'string',
    // A model that reads the line as words to the user also writes it in the reply, where speech and copy pick it up.
    // So the description calls it a label and keeps it out of the reply.
    description: 'Write this first. A short label shown on this call in the chat: what the call does and why, in the language of your reply. It is not part of your reply, so do not repeat it in your text. No final period.',
  },
  [CALL_ICON_ARGUMENT]: {
    type: 'array',
    items: { type: 'string' },
    description: 'Write this second. Up to three Tabler icon names (tabler.io/icons) for what this call does, best first, for example ["currency-baht", "coin"]. A name says what the icon draws: "app-window" is a program window, and "window" is a window of a house. The chat draws the first one that exists next to the label.',
  },
}
const summaryArguments = Object.keys(summaryProperties)

/**
 * The parameters of a tool with the summary arguments first. They are the first properties, so the model writes them
 * before the other arguments. They are required, because a strict provider rejects a property that is not required.
 *
 * Returns `undefined` for a tool that declares one of the arguments itself, or whose parameters are no object.
 */
function parametersWithSummary(parameters: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!parameters || (parameters.type !== undefined && parameters.type !== 'object'))
    return undefined
  const properties = isPlainObject(parameters.properties) ? parameters.properties : {}
  if (summaryArguments.some(name => name in properties))
    return undefined
  const required = Array.isArray(parameters.required) ? parameters.required : []
  return {
    ...parameters,
    type: 'object',
    properties: { ...summaryProperties, ...properties },
    required: [...summaryArguments, ...required],
  }
}

function withoutSummary(input: unknown) {
  return isPlainObject(input) ? omit(input, summaryArguments) : input
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
 * - The tool with the summary arguments. A tool that declares one of them itself stays as it is.
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

// A finished call holds its arguments as JSON text, as the model wrote them. A malformed argument reads as missing, so
// the other one still shows.
const recordedSummarySchema = pipe(string(), parseJson(), looseObject({
  [CALL_SUMMARY_ARGUMENT]: fallback(optional(string()), undefined),
  [CALL_ICON_ARGUMENT]: fallback(array(string()), []),
}))

/** The summary of one call, as the model wrote it. */
export interface CallSummary {
  /** What the call does and why. Missing when the model wrote none. */
  text?: string
  /** The icon candidates of the line, best first. The chat draws the first one that it finds. */
  icons: string[]
}

/**
 * Reads the summary from the recorded arguments of a call.
 *
 * @example
 * readCallSummary('{"call_summary":"Check the weather in Bangkok","call_icon":["cloud-rain"],"city":"Bangkok"}')
 * // => { text: 'Check the weather in Bangkok', icons: ['cloud-rain'] }
 */
export function readCallSummary(args: string): CallSummary {
  const recorded = safeParse(recordedSummarySchema, args)
  if (!recorded.success)
    return { icons: [] }
  return {
    text: recorded.output[CALL_SUMMARY_ARGUMENT]?.trim() || undefined,
    icons: recorded.output[CALL_ICON_ARGUMENT],
  }
}
