import type { ToolCard } from '@proj-airi/agents/tool-card'
import type {} from 'pinia-plugin-synced'

import type { McpCallToolResult } from '../tools/mcp'

import { getIconData } from '@iconify/utils'
import { errorMessageFrom } from '@moeru/std'
import { createParser, createStore, evaluate, evaluateElementProps, extractToolResult } from '@openuidev/lang-core'
import { createToolCardAgent } from '@proj-airi/agents/tool-card'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { loadCardIcons, toolCardLibrary } from '../components/scenarios/chat/components/tool-card-library'
import { useTextGeneration } from '../composables/text-generation'
import { MCP_CALL_TOOL_NAME } from '../tools/mcp'
import { useLlmToolsStore } from './ai/chat-llm/tools'
import { useConsciousnessStore } from './modules/consciousness'

/** A card that a model made for the results of one tool. */
export interface SavedToolCard extends ToolCard {
  /** The tool that the card shows: the registered name, or `server::tool` for an MCP tool. */
  key: string
  createdAt: number
}

/** One call that needs a card. Every field crosses windows, so every field is plain data. */
export interface ToolCardRequest {
  key: string
  /** The name of the called tool. For an MCP tool it is the proxy tool, and `key` names the MCP tool. */
  toolName: string
  args: string
  /** The result of the call, shortened by {@link sampleOf}. */
  sample: unknown
  /** The language of the labels, as a name that the model reads. */
  language: string
  /** Makes a new card when the tool already has one. The new card replaces it. */
  replace?: boolean
}

const STORAGE_KEY = 'tool-cards/cards'

/** A sample keeps the first items of each list and the start of each long string. The model needs only the shape. */
const SAMPLE_LIST_ITEMS = 5
const SAMPLE_STRING_LENGTH = 300

function readStoredCards(): SavedToolCard[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  }
  catch {
    return []
  }
}

/** Shortens a result for the model. Long strings are often images as data URLs, and long lists repeat one shape. */
function sampleOf(value: unknown): unknown {
  if (typeof value === 'string')
    return value.length > SAMPLE_STRING_LENGTH ? `${value.slice(0, SAMPLE_STRING_LENGTH)}…` : value
  if (Array.isArray(value))
    return value.slice(0, SAMPLE_LIST_ITEMS).map(sampleOf)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sampleOf(item)]))
  return value
}

/** Unwraps the result of an MCP call. An error result has nothing to show, so it reads as undefined. */
function mcpResultOf(result: unknown) {
  if (result === null || typeof result !== 'object')
    return result
  const { content, structuredContent, isError } = result as McpCallToolResult
  if (!Array.isArray(content) && structuredContent === undefined)
    return result
  try {
    return extractToolResult({ content: (content ?? []) as { type: string }[], structuredContent, isError })
  }
  catch {
    return undefined
  }
}

/**
 * Reads what a card of a call shows.
 *
 * Returns:
 * - The card key and the result as data. A string that holds JSON counts as its value, and other text stays text.
 * - `undefined` for an empty result, an MCP error, or an MCP call without a tool name. They have nothing to show.
 */
export function readToolCardCall(toolName: string, args: string, result: unknown): { key: string, data: unknown } | undefined {
  let key = toolName
  let value = result
  if (toolName === MCP_CALL_TOOL_NAME) {
    let name: unknown
    try {
      name = (JSON.parse(args) as { name?: unknown }).name
    }
    catch {
      return undefined
    }
    if (typeof name !== 'string' || !name)
      return undefined
    key = name
    value = mcpResultOf(result)
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    }
    catch {
      // Text that is not JSON stays text, and the card shows it.
    }
  }
  return value === undefined || value === null || value === '' ? undefined : { key, data: value }
}

const programParser = createParser(toolCardLibrary.toJSONSchema(), 'Card')
/** A tool name in a Query is a string literal, so it evaluates without state or references. */
const LITERAL_CONTEXT = { getState: () => null, resolveRef: () => null }

/** The icon names of a drawn card, from every part that has an icon. */
function iconNamesOf(value: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value)
      iconNamesOf(item, names)
  }
  else if (value !== null && typeof value === 'object') {
    const node = value as { type?: unknown, props?: Record<string, unknown> }
    if (node.type === 'element' && node.props) {
      if (typeof node.props.icon === 'string' && node.props.icon)
        names.add(node.props.icon)
      for (const prop of Object.values(node.props))
        iconNamesOf(prop, names)
    }
  }
  return names
}

/** The problems that keep a program from showing every later result of its tool. The model reads them in a fix round. */
async function problemsOf(program: string, key: string, sample: unknown): Promise<string[]> {
  const parsed = programParser.parse(program)
  const problems = parsed.meta.errors.map(error => `${error.statementId ?? error.component}${error.path ? ` ${error.path}` : ''}: ${error.message}`)
  if (!parsed.queryStatements.some(query => query.toolAST && evaluate(query.toolAST, LITERAL_CONTEXT) === key))
    problems.push(`The program must read the result with \`Query("${key}", {}, defaults)\` instead of fixed values.`)
  if (parsed.mutationStatements.length > 0)
    problems.push('Remove every Mutation. A card only shows a result.')
  if (!parsed.root) {
    problems.push('No statement renders a Card. Start the program with `root = Card(...)`.')
    return problems
  }

  // The chat draws the program with each result, so it is drawn here with the sample. An icon name that MingCute does
  // not have, or a value that fails to draw, shows now, while the model can still fix it.
  const store = createStore()
  store.initialize(parsed.stateDeclarations ?? {}, {})
  const queries = new Set(parsed.queryStatements.map(query => query.statementId))
  try {
    const drawn = evaluateElementProps(parsed.root, {
      ctx: { getState: name => store.get(name) ?? null, resolveRef: name => queries.has(name) ? sample : null },
      library: toolCardLibrary,
      store,
    })
    const icons = await loadCardIcons()
    for (const name of iconNamesOf(drawn)) {
      if (!getIconData(icons, name))
        problems.push(`"${name}" is not a MingCute icon name. Use a MingCute name such as "github-line", or leave the icon out.`)
    }
  }
  catch (error) {
    problems.push(`Drawing the sample failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
  return problems
}

/**
 * The saved cards, shared by every window.
 *
 * The leader owns the side effects: it asks the chat model for a card and writes the cards to localStorage. Other
 * windows read the stored cards once, then receive each change as a state snapshot.
 */
const useToolCardsStateStore = defineStore('tool-cards-state', () => {
  const cards = ref<SavedToolCard[]>(readStoredCards())

  const consciousness = useConsciousnessStore()
  const llmTools = useLlmToolsStore()
  const { generateText } = useTextGeneration()

  // Leader-local bookkeeping. Every window that shows a call asks for its card, so one request per key runs at a time.
  // A key that failed is not tried again until the owner asks for a new card, so a broken tool never repeats requests.
  const running = new Map<string, Promise<boolean>>()
  const failed = new Set<string>()

  async function make(request: ToolCardRequest): Promise<ToolCard> {
    const providerId = consciousness.activeProvider
    const model = consciousness.activeModel
    if (!providerId || !model)
      throw new Error('No chat model is configured')
    const tool = llmTools.tools.find(entry => entry.function.name === request.toolName)
    // An MCP tool runs through the proxy tool, whose description is about the proxy, so an MCP card has none.
    const description = request.key === request.toolName ? tool?.function.description : undefined
    const agent = createToolCardAgent({
      generateText: generateText({ providerId, model }),
      validate: program => problemsOf(program, request.key, request.sample),
    })
    return agent.make({
      catalogPrompt: toolCardLibrary.prompt({
        inlineMode: true,
        toolCalls: true,
        bindings: false,
        tools: [{
          name: request.key,
          description,
          inputSchema: request.key === request.toolName ? tool?.function.parameters ?? { type: 'object' } : { type: 'object' },
          outputSchema: { type: 'object' },
        }],
      }),
      key: request.key,
      description,
      args: request.args,
      sample: request.sample,
      language: request.language,
    }, new AbortController().signal)
  }

  /**
   * Makes the card of a tool. Resolves to whether the tool has a card afterwards.
   * A request for a key that has a card resolves at once, unless it asks to replace the card.
   */
  async function makeCard(request: ToolCardRequest): Promise<boolean> {
    if (!request.replace && cards.value.some(card => card.key === request.key))
      return true
    const current = running.get(request.key)
    if (current)
      return current
    if (!request.replace && failed.has(request.key))
      return false

    const run = (async () => {
      try {
        const card: SavedToolCard = { key: request.key, ...await make(request), createdAt: Date.now() }
        cards.value = [...cards.value.filter(entry => entry.key !== card.key), card]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.value))
        failed.delete(request.key)
        return true
      }
      catch (error) {
        console.warn('[tool-cards] Failed to make a card:', errorMessageFrom(error))
        failed.add(request.key)
        return false
      }
      finally {
        running.delete(request.key)
      }
    })()
    running.set(request.key, run)
    return run
  }

  return { cards, makeCard }
}, {
  synced: {
    actions: ['makeCard'],
    state: true,
  },
})

/** The cards of tool calls, as this window shows them. */
export const useToolCardsStore = defineStore('tool-cards', () => {
  const state = useToolCardsStateStore()

  const cardsByKey = computed(() => new Map(state.cards.map(card => [card.key, card])))
  // Keys whose card this window waits for. The chat shows that a card is on its way while the leader makes it.
  const making = ref<ReadonlySet<string>>(new Set())

  /** Asks the leader for the card of a call. A second request for a key that this window waits for does nothing. */
  async function request(call: { key: string, toolName: string, args: string, data: unknown, language: string, replace?: boolean }) {
    if (making.value.has(call.key))
      return
    making.value = new Set(making.value).add(call.key)
    try {
      await state.makeCard({ key: call.key, toolName: call.toolName, args: call.args, sample: sampleOf(call.data), language: call.language, replace: call.replace })
    }
    finally {
      const next = new Set(making.value)
      next.delete(call.key)
      making.value = next
    }
  }

  return { cardsByKey, making, request }
})
