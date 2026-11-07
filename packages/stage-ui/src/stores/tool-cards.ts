import type { ToolCard } from '@proj-airi/agents/tool-card'
import type {} from 'pinia-plugin-synced'

import type { McpCallToolResult } from '../tools/mcp'

import { errorMessageFrom } from '@moeru/std'
import { extractToolResult } from '@openuidev/lang-core'
import { createToolCardAgent } from '@proj-airi/agents/tool-card'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { useTextGeneration } from '../composables/text-generation'
import { toolCardDataRepo } from '../database/repos/tool-card-data.repo'
import { problemsOfProgram } from '../libs/cards/program'
import { cardLanguagePrompt } from '../libs/cards/prompt'
import { MCP_CALL_TOOL_NAME } from '../tools/mcp'
import { createSearchIconsTool } from '../tools/search-icons'
import { useLlmToolsStore } from './ai/chat-llm/tools'
import { useConsciousnessStore } from './modules/consciousness'

/**
 * A card that a model made for the results of one tool. The result of the latest call of the tool lives apart, in
 * {@link toolCardDataRepo}, because it can be large.
 */
export interface SavedToolCard extends ToolCard {
  /** The tool that the card shows: the registered name, or `server::tool` for an MCP tool. */
  key: string
  createdAt: number
  /** When the tool was last called with this card. The latest call changes with it. */
  usedAt: number
}

/** A call that the chat shows with a card, as the chat asks for its card. */
export interface ToolCardCall {
  /**
   * The call in the chat: its message and its key in the reply. Each call gets at most one new card on its own after
   * its card failed to draw.
   */
  callId: string
  key: string
  toolName: string
  args: string
  /** What the call does and why, as the chat model wrote it in the call. */
  summary?: string
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
  /** What the call does and why, as the chat model wrote it in the call. */
  summary?: string
  /** The result of the call. */
  data: unknown
  /** The language of the labels, as a name that the model reads. */
  language: string
  /** Makes a new card when the tool already has one. The new card replaces it. */
  replace?: boolean
}

const STORAGE_KEY = 'tool-cards/cards'

function readStoredCards(): SavedToolCard[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored : []
  }
  catch {
    return []
  }
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
      validate: program => problemsOfProgram(program, { key: request.key, data: request.data }),
      // The model searches the icons that it names, so a card never guesses one.
      tools: await createSearchIconsTool(),
    })
    return agent.make({
      catalogPrompt: ['You write a card in openui-lang, a declarative UI language, as the program of an app card.', '', cardLanguagePrompt()].join('\n'),
      key: request.key,
      description,
      args: request.args,
      summary: request.summary,
      result: request.data,
      language: request.language,
    }, new AbortController().signal)
  }

  /** Removes the latest call of a card version that no card uses. One left behind has no card to show it. */
  async function forgetLatestCall(key: string, version: number) {
    await toolCardDataRepo.remove(key, version)
      .catch(error => console.warn('[tool-cards] Failed to remove the latest call of a card:', errorMessageFrom(error)))
  }

  /** Saves the cards, then shows them. When the save fails, the cards stay as they were. */
  function commit(next: SavedToolCard[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    cards.value = next
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
        const now = Date.now()
        const card: SavedToolCard = { key, ...made, createdAt: now, usedAt: now }
        // The card and its latest call are one save. The latest call goes first, under the version of the new card, so
        // a card never shows without its preview. A failed save fails the card, and the card that was there keeps its
        // own preview.
        await toolCardDataRepo.set(key, card.createdAt, request.data)
        const previous = cards.value.find(entry => entry.key === key)
        try {
          if ((generations.get(key) ?? 0) !== generation) {
            await forgetLatestCall(key, card.createdAt)
            return false
          }
          commit([...cards.value.filter(entry => entry.key !== key), card])
        }
        catch (error) {
          await forgetLatestCall(key, card.createdAt)
          throw error
        }
        if (previous)
          await forgetLatestCall(key, previous.createdAt)
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
    const card = cards.value.find(entry => entry.key === key)
    commit(cards.value.filter(entry => entry.key !== key))
    if (card)
      await forgetLatestCall(key, card.createdAt)
  }

  /**
   * Ends the card requests that no request in this window runs. A promoted leader calls it: the requests of the old
   * leader died with it, and their keys would show a card on its way forever. They count as failed, so the chat offers
   * to try again.
   */
  function releaseOrphanedCards() {
    const orphaned = making.value.filter(key => !running.has(key))
    if (orphaned.length === 0)
      return
    making.value = making.value.filter(key => running.has(key))
    failed.value = [...new Set([...failed.value, ...orphaned])]
  }

  /**
   * Keeps the latest call of a tool for the version of its card. A tool without a card keeps nothing. The new `usedAt`
   * comes after the call is in place, so a preview that reads again on it finds the new call. A call that fails to save
   * keeps the call before it.
   */
  async function recordCall(key: string, data: unknown) {
    const card = cards.value.find(entry => entry.key === key)
    if (!card)
      return
    await toolCardDataRepo.set(key, card.createdAt, data)
    const now = Date.now()
    commit(cards.value.map(card => card.key === key ? { ...card, usedAt: now } : card))
  }

  return { cards, making, failed, makeCard, deleteCard, recordCall, releaseOrphanedCards }
}, {
  synced: {
    actions: ['makeCard', 'deleteCard', 'recordCall'],
    state: true,
  },
})

/** How the chat shows the card of one call. */
export type ToolCardView
  = | { status: 'none' }
    /** The leader makes a card for the tool. `card` is the card that the new one replaces. */
    | { status: 'making', card?: SavedToolCard }
    | { status: 'shown', card: SavedToolCard }
    /** The tool has no card that draws this result, and the last try failed. The owner can try again. */
    | { status: 'failed' }

/**
 * The cards of tool calls, as this window shows them.
 *
 * The chat reports what it shows and which card failed to draw. This store decides when a card is made: a new call
 * asks at once, so its card is ready when the owner unfolds it, and an old call asks only when its row is unfolded.
 */
export const useToolCardsStore = defineStore('tool-cards', () => {
  const state = useToolCardsStateStore()
  // Off, the chat makes no cards and shows every call as it is. The saved cards stay for when it is on again.
  const enabled = useLocalStorageManualReset<boolean>('settings/tool-cards/enabled', true)
  // Off, the chat model gets no card tool in the owner's chat, so it answers in text. Cards in old replies still show.
  const replyCardsEnabled = useLocalStorageManualReset<boolean>('settings/tool-cards/reply-cards', true)

  const cardsByKey = computed(() => new Map(state.cards.map(card => [card.key, card])))
  /** The saved cards, newest first. */
  const cards = computed(() => [...state.cards].sort((left, right) => right.createdAt - left.createdAt))
  const making = computed(() => new Set(state.making))
  const failed = computed(() => new Set(state.failed))
  // The program that failed to draw the result of each call. The program of a new card draws again.
  const brokenCalls = shallowRef<ReadonlyMap<string, string>>(new Map())

  function requestOf(call: ToolCardCall, replace?: boolean): ToolCardRequest {
    return { key: call.key, toolName: call.toolName, args: call.args, summary: call.summary, data: call.data, language: languageNameOf(call.locale), replace }
  }

  function ask(call: ToolCardCall, replace?: boolean) {
    state.makeCard(requestOf(call, replace))
      .catch(error => console.warn('[tool-cards] Failed to ask for a card:', errorMessageFrom(error)))
  }

  function viewOf(call: ToolCardCall): ToolCardView {
    if (!enabled.value)
      return { status: 'none' }
    const card = cardsByKey.value.get(call.key)
    if (making.value.has(call.key))
      return { status: 'making', card }
    if (card)
      return brokenCalls.value.get(call.callId) === card.program ? { status: 'failed' } : { status: 'shown', card }
    return failed.value.has(call.key) ? { status: 'failed' } : { status: 'none' }
  }

  /**
   * Reports a call that the chat shows. `fresh` says that the call finished while its reply streams, and `open` that
   * its row is unfolded. A tool without a card gets one from such a call. A tool that failed waits for a try again.
   */
  function want(call: ToolCardCall, shown: { fresh: boolean, open: boolean }) {
    if (enabled.value && (shown.fresh || shown.open) && viewOf(call).status === 'none')
      ask(call)
  }

  /** Reports a card that failed to draw the result of a call. The first failure of each call asks for a new card. */
  function reportBroken(call: ToolCardCall, program: string) {
    if (brokenCalls.value.get(call.callId) === program)
      return
    const first = !brokenCalls.value.has(call.callId)
    brokenCalls.value = new Map(brokenCalls.value).set(call.callId, program)
    if (first && enabled.value)
      ask(call, true)
  }

  /** Asks for a new card of a call: the owner wants another card, or tries again after a failure. */
  function remake(call: ToolCardCall) {
    if (enabled.value)
      ask(call, true)
  }

  async function remove(key: string) {
    await state.deleteCard(key)
  }

  /** Keeps a finished call of a saved reply as the latest call on the card of its tool. A tool without a card keeps nothing. */
  async function recordCall(toolName: string, args: string, result: unknown) {
    const call = readToolCardCall(toolName, args, result)
    if (call && cardsByKey.value.has(call.key))
      await state.recordCall(call.key, call.data)
  }

  /** Ends the card requests of an old leader. Only a promoted leader calls it. */
  function releaseOrphanedCards() {
    state.releaseOrphanedCards()
  }

  /** The result of the latest call of a tool, for the preview of its card. A card can have none. */
  async function latestCallOf(card: SavedToolCard) {
    return toolCardDataRepo.get(card.key, card.createdAt)
  }

  return { enabled, replyCardsEnabled, cards, viewOf, want, reportBroken, remake, remove, recordCall, releaseOrphanedCards, latestCallOf }
})
