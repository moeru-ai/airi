import type { Conversation } from '@proj-airi/core-agent'

import type { GenerateText } from '../generate-text'

/**
 * What the model must do beyond the OpenUI Lang rules of the catalog prompt.
 *
 * The catalog prompt teaches a chat that builds whole apps, so it tells the model to call tools first and offers forms.
 * A card only shows one stored result, and the app saves it to show later results of the same tool.
 */
export const TOOL_CARD_INSTRUCTIONS = [
  'You design a card that shows the result of one tool call in a chat app.',
  'The app saves the card and shows every later result of the same tool with it, so the card must work for other results of the same shape.',
  'You cannot call the tool of the card. The user message gives the result of one call as a sample. A result can be an object, a list, or text.',
  'Read the result with exactly one Query, for example `data = Query("tool_name", {}, {items: []})`. The app answers that Query with the result of each call.',
  'Read every value from the Query. Never copy values of the sample into the program.',
  'Do not use Mutation, forms, or $variables.',
  'Show first what a person wants to know. Leave out ids, hashes, and internal fields unless they matter to a person.',
  'Write every label in the language that the user message names.',
  'Reply with one sentence that says what the card shows, then the program in one ```openui-lang fence.',
].join('\n')

/** One call of a tool, as the model sees it. */
export interface ToolCardRequest {
  /** The OpenUI Lang rules and the component signatures of the app's card catalog. */
  catalogPrompt: string
  /** The tool name that the program queries: the registered name, or `server::tool` for an MCP tool. */
  key: string
  /** What the tool does. An MCP tool called through the MCP proxy has no description in the app. */
  description?: string
  /** The arguments of this call, as the chat model sent them. */
  args: string
  /** What this call does and why, in the words of the chat model. It is about this call only, not every call of the tool. */
  summary?: string
  /** The result of this call, in full. */
  result: unknown
  /** The language of the labels, as a name that the model reads, for example `简体中文`. */
  language: string
}

/** A card that the model made. */
export interface ToolCard {
  /** One sentence that says what the card shows. */
  description: string
  /** The OpenUI Lang program. It reads the call result through `Query(key)`. */
  program: string
}

const FENCE_PATTERN = /```[^\n]*\n([\s\S]*?)```/

/** Reads the sentence and the fenced program of a reply. A reply without a fence throws. */
export function readToolCardReply(reply: string): ToolCard {
  const match = FENCE_PATTERN.exec(reply)
  const program = match?.[1]?.trim()
  if (!match || !program)
    throw new Error('The card reply has no openui-lang fence')
  const description = reply.replace(match[0], '').trim().split('\n')[0]?.trim() ?? ''
  return { description, program }
}

/** The result as the model sees it. The items of a list share one shape, so each list keeps only its first item. */
function shapeOf(value: unknown): unknown {
  if (Array.isArray(value))
    return value.slice(0, 1).map(shapeOf)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]))
  return value
}

function describeCall(request: ToolCardRequest) {
  return [
    `Tool: ${request.key}`,
    ...(request.description ? [`What the tool does: ${request.description}`] : []),
    `Arguments of this call: ${request.args}`,
    ...(request.summary ? [`Why the chat model made this call: ${request.summary}`] : []),
    `Labels language: ${request.language}`,
    'Result of this call, with only the first item of each list:',
    JSON.stringify(shapeOf(request.result), null, 2),
  ].join('\n')
}

/** Builds the request that makes one card. */
export function createToolCardConversation(request: ToolCardRequest): Conversation {
  return { turns: [
    { id: 'tool-card-catalog', type: 'system', authority: 'system', content: [{ type: 'text', text: request.catalogPrompt }] },
    { id: 'tool-card-instructions', type: 'system', authority: 'system', content: [{ type: 'text', text: TOOL_CARD_INSTRUCTIONS }] },
    { id: 'tool-card-call', type: 'user', content: [{ type: 'text', text: describeCall(request) }] },
  ] }
}

export interface ToolCardAgentOptions {
  /** Sends the request to the selected chat model. */
  generateText: GenerateText
  /**
   * Checks a program with the app's catalog and the result. Returns the problems, empty when the program renders as written.
   * The model reads each problem in the fix round, so a problem names the statement and the fix.
   */
  validate: (program: string) => string[] | Promise<string[]>
  /** Tools that the model can use while it writes, for example an icon search. */
  tools?: Parameters<GenerateText>[2]
}

/**
 * Makes a card for the result of one tool call with a chat model.
 *
 * Use when:
 * - The chat shows a call of a tool that has no widget of its own.
 * - An eval measures how well a model writes cards.
 *
 * Returns:
 * - `make`, which resolves to the card. When the first program has problems, the model gets them and one more try.
 *   It rejects when a request fails, a reply has no program, or the second program still has problems.
 */
export function createToolCardAgent(options: ToolCardAgentOptions) {
  async function make(request: ToolCardRequest, signal: AbortSignal): Promise<ToolCard> {
    const conversation = createToolCardConversation(request)
    const reply = await options.generateText(conversation, signal, options.tools)
    const card = readToolCardReply(reply)
    const problems = await options.validate(card.program)
    if (problems.length === 0)
      return card

    // The fix round shows the model its own reply and what the parser found, so it changes only what is wrong.
    const fix = [
      'Your reply:',
      reply,
      'The app could not use the program as written:',
      ...problems.map(problem => `- ${problem}`),
      'Reply again with the sentence and the whole fixed program.',
    ].join('\n')
    const fixed = readToolCardReply(await options.generateText({ turns: [
      ...conversation.turns,
      { id: 'tool-card-fix', type: 'user', content: [{ type: 'text', text: fix }] },
    ] }, signal, options.tools))
    const remaining = await options.validate(fixed.program)
    if (remaining.length > 0)
      throw new Error(`The card program still has problems: ${remaining.join('; ')}`)
    return fixed
  }

  return { make }
}
