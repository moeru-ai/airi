import type { Tool } from '@xsai/shared-chat'

import { rawTool } from '@xsai/tool'
import { array, description, literal, object, pipe, safeParse, strictObject, string, union } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { parseJson } from './judge-recipe'

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

const drawCardParameters = strictObject({
  program: pipe(string(), description('The openui-lang program of the card, with every value written in it. Empty on your first card of the conversation, to get the rules.')),
})

const drawCardResultSchema = union([
  object({ status: literal('rules'), rules: string() }),
  object({ status: literal('problems'), problems: array(string()) }),
  object({ status: literal('shown') }),
])

/**
 * Reads a recorded call for the chat: the program from the arguments, and the outcome from the result.
 * A call that is still running, or a result in another shape, has no outcome.
 */
export function readCardDraw(args: string, result: unknown): { program: string, outcome?: DrawCardResult } {
  const input = safeParse(drawCardParameters, parseJson(args))
  const outcome = safeParse(drawCardResultSchema, parseJson(result))
  return {
    program: input.success ? input.output.program : '',
    outcome: outcome.success ? outcome.output : undefined,
  }
}

/**
 * The part of the system prompt that says when to draw a card. A tool in the tool list alone almost never gets
 * called for this, so the model would keep answering a table or a conversion in text.
 */
export function composeDrawCardPrompt() {
  return [
    '',
    '',
    `Cards. You can show a card inside your reply with ${DRAW_CARD_TOOL_NAME}. A card reads better than text, so draw one whenever the answer is:`,
    '- a table, or a list of items that each have values, for example the time in several cities, prices, or scores',
    '- a conversion or a calculation, for example money or units',
    '- a comparison of a few options',
    '- a few key numbers or facts',
    'Never write a markdown table. Draw a card instead.',
    'Around the card, write at most one short sentence. The card holds the details, so do not repeat them in text.',
  ].join('\n')
}

interface CreateDrawCardToolOptions {
  /** How to write a program, with the parts of the card catalog. */
  rules: () => string
  /** Checks and draws a program. Resolves to the problems, empty when the card draws. */
  check: (program: string) => Promise<string[]>
}

/**
 * Creates the tool that shows a card inside a reply.
 *
 * The card is part of one answer. Its program lives in the call, so it is not saved anywhere else. A call without a
 * program returns the rules, so the rules reach the model only when it draws a card.
 */
export async function createDrawCardTool(options: CreateDrawCardToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(drawCardParameters)

  return [
    rawTool({
      name: DRAW_CARD_TOOL_NAME,
      description: [
        'Shows a card inside your reply. Use it when a card answers better than text, for example a conversion, a comparison, a list, or a few key facts.',
        'On your first card in this conversation, call it with an empty program: it returns how to write one. Then call it again with the program.',
        'The owner sees only a card that draws. When the result lists problems, fix them and call again.',
      ].join('\n'),
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(drawCardParameters, rawInput)
        const program = parsed.success ? parsed.output.program.trim() : ''
        if (!program)
          return JSON.stringify({ status: 'rules', rules: options.rules() } satisfies DrawCardResult)
        const problems = await options.check(program)
        const result: DrawCardResult = problems.length > 0 ? { status: 'problems', problems } : { status: 'shown' }
        return JSON.stringify(result)
      },
    }),
  ]
}
