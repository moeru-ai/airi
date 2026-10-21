import type { ChatSlicesCard, ToolContent } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { array, description, literal, nullable, object, parseJson, pipe, safeParse, strictObject, string, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { problemsOfProgram } from '../libs/cards/program'
import { cardLanguagePrompt } from '../libs/cards/prompt'

export const DRAW_CARD_TOOL_NAME = 'builtIn_drawCard'

/**
 * What the tool returns. The chat renders it, and the model reads it as JSON.
 * - `rules`: the call had no program, so it returns how to write one.
 * - `problems`: the program does not draw. The model fixes it and calls again.
 * - `shown`: the card shows in the reply.
 */
export type DrawCardResult
  = | { status: 'rules', rules: string }
    | { status: 'problems', problems: string[] }
    | { status: 'shown' }

// A strict OpenAI-compatible provider rejects a tool whose properties are not all required, so `text` is nullable
// instead of optional.
const drawCardParameters = strictObject({
  program: pipe(string(), description('The openui-lang program of the card, with every value written in it. Empty on your first card of the conversation, to get the rules.')),
  text: nullable(pipe(string(), description('The card as plain text: the answer and its key values, in a sentence or two. Copy, cloud sync, and export show it in place of the card. Null while you only get the rules.'))),
})

const drawCardResultSchema = union([
  object({ status: literal('rules'), rules: string() }),
  object({ status: literal('problems'), problems: array(string()) }),
  object({ status: literal('shown') }),
])

// A finished call holds its arguments and its result as JSON text. The arguments also hold the summary that every call
// carries (see `stores/ai/chat-llm/tool-call-summary`), so the record reads only the fields of the card.
const recordedInputSchema = pipe(string(), parseJson(), object(drawCardParameters.entries))
const recordedResultSchema = pipe(string(), parseJson(), drawCardResultSchema)

/** The card of a finished call. A call that only got the rules, or whose program had problems, adds no card. */
function cardOf(args: string, result: unknown): ChatSlicesCard[] {
  const input = safeParse(recordedInputSchema, args)
  const outcome = safeParse(recordedResultSchema, result)
  if (!input.success || !outcome.success || outcome.output.status !== 'shown')
    return []
  return [{ type: 'card', program: input.output.program, text: input.output.text?.trim() ?? '' }]
}

/** Calls of the card tool add a card to the reply in place of the call. */
export const drawCardContent: ToolContent = { kind: 'card', contentOf: cardOf }

/**
 * The part of the system prompt that says when to draw a card. A tool in the tool list alone almost never gets
 * called for this, so the model would answer structured data in text.
 *
 * - A model that failed with tools gets no tools, so the part applies only while the tool is in the list.
 * - Speech, copy, quotes, and cloud sync read only the text of a reply, so the text still says the answer.
 */
export function composeDrawCardPrompt() {
  return [
    '',
    '',
    `Cards. When ${DRAW_CARD_TOOL_NAME} is in your tools, you can show a card inside your reply.`,
    'Draw a card when the answer is structured: several items that each have values, a comparison of options, or a few figures that belong together. Answer in text when the answer is short, conversational, or one fact.',
    'While you have the tool, show a table as a card, not as a markdown table.',
    'When you draw a card, still say the answer itself in your text, because your text is spoken aloud and copied. Leave the details to the card instead of repeating them. This does not shorten a reply without a card, or an explanation that the user asks for.',
  ].join('\n')
}

/** How to write the program of a reply card. The tool returns it on the first call, so a turn without a card does not carry it. */
function replyCardRules() {
  return [
    'These are the rules for the `program` argument of the card tool. The program is openui-lang, a declarative UI language. Write it only in that argument, never in your reply text.',
    '',
    cardLanguagePrompt(),
    '',
    '## Reply cards',
    '',
    '- Write every value into the program. A reply card has no Query and no tools.',
    '- Keep the card small: the answer first, then the few facts that support it.',
  ].join('\n')
}

/**
 * Creates the tool that shows a card inside a reply.
 *
 * The card is part of one answer. A call that draws becomes a card of the reply, with its text for places that cannot
 * draw it. A call without a program returns the rules, so the rules reach the model only when it draws a card.
 */
export async function createDrawCardTool(): Promise<Tool[]> {
  const parameters = await toJsonSchema(drawCardParameters)

  return [
    rawTool({
      name: DRAW_CARD_TOOL_NAME,
      description: [
        'Shows a card inside your reply. Use it when the answer is structured: several items with values, a comparison, or a few figures that belong together. Still say the answer itself in your reply text.',
        'On your first card in this conversation, call it with an empty program: it returns how to write one. Then call it again with the program and its text.',
        'The owner sees only a card that draws. When the result lists problems, fix them and call again.',
      ].join('\n'),
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(drawCardParameters, rawInput)
        const program = parsed.success ? parsed.output.program.trim() : ''
        if (!program)
          return JSON.stringify({ status: 'rules', rules: replyCardRules() } satisfies DrawCardResult)
        const problems = await problemsOfProgram(program)
        if (!parsed.success || !parsed.output.text?.trim())
          problems.push('Write the `text` of the card: the answer and its key values as plain text.')
        const result: DrawCardResult = problems.length > 0 ? { status: 'problems', problems } : { status: 'shown' }
        return JSON.stringify(result)
      },
    }),
  ]
}
