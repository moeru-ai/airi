import type { ToolCard } from '@proj-airi/agents/tool-card'
import type {} from 'pinia-plugin-synced'

import type { McpCallToolResult } from '../tools/mcp'

import { errorMessageFrom } from '@moeru/std'
import { extractToolResult } from '@openuidev/lang-core'
import { createToolCardAgent } from '@proj-airi/agents/tool-card'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { problemsOfProgram, toolCardLibrary } from '../components/scenarios/chat/components/tool-card-library'
import { useTextGeneration } from '../composables/text-generation'
import { MCP_CALL_TOOL_NAME } from '../tools/mcp'
import { useLlmToolsStore } from './ai/chat-llm/tools'
import { useConsciousnessStore } from './modules/consciousness'

/** A card that a model made for the results of one tool. */
export interface SavedToolCard extends ToolCard {
  /** The tool that the card shows: the registered name, or `server::tool` for an MCP tool. */
  key: string
  /** The shortened result of the latest call of the tool, at first the call that the card was made from. The settings page draws the card with it. */
  sample: unknown
  createdAt: number
  /** When the tool was last called with this card. */
  usedAt: number
}

/** A call that the chat shows with a card, as the chat asks for its card. */
export interface ToolCardCall {
  key: string
  toolName: string
  args: string
  /** The result of the call as data. */
  data: unknown
  /** The locale of the chat. The labels of the card use its language. */
  locale: string
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

/** The value of a JSON string, or the text itself when it holds no JSON. */
function valueOfText(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/** The language of the labels, as a name that the model reads, in the language itself. */
function languageNameOf(locale: string) {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale
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
  // The chat keeps an object result as a JSON string, so the string is read first. An MCP result unwraps after that.
  let value = typeof result === 'string' ? valueOfText(result) : result
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
    value = mcpResultOf(value)
  }
  return value === undefined || value === null || value === '' ? undefined : { key, data: value }
}

/**
 * The saved cards, shared by every window.
 *
 * The leader owns the side effects: it asks the chat model for each card once, even when several windows ask for it,
 * and writes the cards to localStorage. Other windows read the stored cards once, then receive each change as a state snapshot.
 */
const useToolCardsStateStore = defineStore('tool-cards-state', () => {
  const cards = ref<SavedToolCard[]>(readStoredCards())
  // Which tools get a card now, and which failed. Every window shows them on the calls of those tools, so they are
  // shared state, and only the leader changes them.
  const making = ref<string[]>([])
  const failed = ref<string[]>([])

  const consciousness = useConsciousnessStore()
  const llmTools = useLlmToolsStore()
  const { generateText } = useTextGeneration()

  // Leader-local bookkeeping. One request per key runs at a time. A delete starts a new generation of its key, so a
  // request that started before the delete does not write its card back.
  const running = new Map<string, Promise<boolean>>()
  const generations = new Map<string, number>()

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
      validate: program => problemsOfProgram(program, { key: request.key, sample: request.sample }),
    })
    return agent.make({
      catalogPrompt: toolCardLibrary.prompt({
        preamble: 'You write a card in openui-lang, a declarative UI language, as the program of an app card.',
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

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards.value))
  }

  /**
   * Makes the card of a tool. Resolves to whether the tool has a card afterwards.
   * A request for a key that has a card resolves at once, unless it asks to replace the card. A key that failed is not
   * tried again on its own, so a broken tool never repeats requests: only a request to replace the card retries it.
   */
  async function makeCard(request: ToolCardRequest): Promise<boolean> {
    const { key } = request
    if (!request.replace && cards.value.some(card => card.key === key))
      return true
    const current = running.get(key)
    if (current)
      return current
    if (!request.replace && failed.value.includes(key))
      return false

    const generation = generations.get(key) ?? 0
    const run = (async () => {
      making.value = [...making.value, key]
      failed.value = failed.value.filter(entry => entry !== key)
      try {
        const made = await make(request)
        if ((generations.get(key) ?? 0) !== generation)
          return false
        const now = Date.now()
        const card: SavedToolCard = { key, ...made, sample: request.sample, createdAt: now, usedAt: now }
        cards.value = [...cards.value.filter(entry => entry.key !== key), card]
        save()
        return true
      }
      catch (error) {
        console.warn('[tool-cards] Failed to make a card:', errorMessageFrom(error))
        if ((generations.get(key) ?? 0) === generation)
          failed.value = [...failed.value, key]
        return false
      }
      finally {
        running.delete(key)
        making.value = making.value.filter(entry => entry !== key)
      }
    })()
    running.set(key, run)
    return run
  }

  /** Deletes the card of a tool. A card that the model still makes for it is dropped when it arrives. */
  async function deleteCard(key: string) {
    generations.set(key, (generations.get(key) ?? 0) + 1)
    failed.value = failed.value.filter(entry => entry !== key)
    cards.value = cards.value.filter(card => card.key !== key)
    save()
  }

  /** Keeps the latest call of a tool on its card. A tool without a card keeps nothing. */
  async function recordCall(key: string, sample: unknown) {
    if (!cards.value.some(card => card.key === key))
      return
    const now = Date.now()
    cards.value = cards.value.map(card => card.key === key ? { ...card, sample, usedAt: now } : card)
    save()
  }

  return { cards, making, failed, makeCard, deleteCard, recordCall }
}, {
  synced: {
    actions: ['makeCard', 'deleteCard', 'recordCall'],
    state: true,
  },
})

/** The cards of tool calls, as this window shows them. */
export const useToolCardsStore = defineStore('tool-cards', () => {
  const state = useToolCardsStateStore()
  // Off, the chat makes no cards and shows every call as it is. The saved cards stay for when it is on again.
  const enabled = useLocalStorageManualReset<boolean>('settings/tool-cards/enabled', true)
  // Off, the chat model gets no card tool in the owner's chat, so it answers in text. Cards in old replies still show.
  const replyCardsEnabled = useLocalStorageManualReset<boolean>('settings/tool-cards/reply-cards', true)

  const cardsByKey = computed(() => new Map(state.cards.map(card => [card.key, card])))
  /** The saved cards, newest first. */
  const cards = computed(() => [...state.cards].sort((left, right) => right.createdAt - left.createdAt))
  /** Tools whose card the leader makes now. The chat shows that a card is on its way. */
  const making = computed<ReadonlySet<string>>(() => new Set(state.making))
  /** Tools whose card failed. The chat offers to try again. */
  const failed = computed<ReadonlySet<string>>(() => new Set(state.failed))

  function requestOf(call: ToolCardCall, replace?: boolean): ToolCardRequest {
    return { key: call.key, toolName: call.toolName, args: call.args, sample: sampleOf(call.data), language: languageNameOf(call.locale), replace }
  }

  /**
   * Asks the leader for the first card of a tool, made from a new call that the chat shows with a card.
   * Only the chat knows which tools show their own widget, so the chat asks, not the reply that the leader saves.
   */
  async function make(call: ToolCardCall) {
    if (!enabled.value)
      return
    await state.makeCard(requestOf(call))
  }

  /** Asks the leader for a new card of a call: the owner wants another card, or tries again after a failure. */
  async function remake(call: ToolCardCall) {
    if (!enabled.value)
      return
    await state.makeCard(requestOf(call, true))
  }

  async function remove(key: string) {
    await state.deleteCard(key)
  }

  /** Keeps a finished call of a saved reply as the latest call on the card of its tool. A tool without a card keeps nothing. */
  async function recordCall(toolName: string, args: string, result: unknown) {
    const call = readToolCardCall(toolName, args, result)
    if (call && cardsByKey.value.has(call.key))
      await state.recordCall(call.key, sampleOf(call.data))
  }

  return { enabled, replyCardsEnabled, cards, cardsByKey, making, failed, make, remake, remove, recordCall }
})
