import type { StreamOptions } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLLM } from './ai/chat-llm/llm'
import { useLlmToolsStore } from './ai/chat-llm/tools'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useConsciousnessStore } from './modules/consciousness'
import { useRecipesStore } from './recipes'

const pinias: ReturnType<typeof createPinia>[] = []

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
}

/**
 * Mounts the chat with real stores. Only the model boundary is replaced: provider resolution and the stream.
 * `reply` answers each request from its prompt, and the returned prompts list every request in order.
 */
async function setupChat(reply: (prompt: string, options?: StreamOptions) => Promise<string>) {
  const pinia = createPinia()
  pinias.push(pinia)
  render(defineComponent({
    setup() {
      useChatStore()
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  // Sessions persist in IndexedDB across tests, so each test talks in a conversation of its own.
  await sessions.createSession(sessions.sessionMetas[sessions.activeSessionId]?.characterId ?? 'default')
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'test-model'
  vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue(provider)
  const prompts: string[] = []
  vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, context, options) => {
    const prompt = JSON.stringify(context)
    prompts.push(prompt)
    const text = await reply(prompt, options)
    if (text)
      await options?.onStreamEvent?.({ type: 'text-delta', text })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  return { pinia, chat: useChatStore(pinia), sessions, recipes: useRecipesStore(pinia), prompts }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const pinia of pinias.splice(0)) {
    useModsServerChannelStore(pinia).dispose()
    useChatStore(pinia).dispose()
    disposePinia(pinia)
  }
  localStorage.clear()
})

// ROOT CAUSE:
// A cancelled send ends without an error, so a stopped task looked finished and reported a result to the conversation.
it('stops a running task without a result, and starts the next waiting one', async () => {
  const { chat, sessions, recipes, prompts } = await setupChat(async (prompt, options) => {
    // The first task streams until it is stopped.
    if (prompt.includes('Watch the page.'))
      await new Promise<void>(resolve => options?.abortSignal?.addEventListener('abort', () => resolve(), { once: true }))
    return 'done'
  })
  recipes.add({ name: 'Watch', description: 'Watches a page.', instructions: 'Watch the page.', triggers: [], background: true, enabled: true })
  recipes.add({ name: 'Sum', description: 'Adds numbers.', instructions: 'Add the numbers.', triggers: [], background: true, enabled: true })
  const [watch, sum] = ['Watch', 'Sum'].map(name => recipes.recipes.find(recipe => recipe.name === name)!)
  const parent = sessions.activeSessionId

  // An empty send never runs, so an empty task is refused instead of ending as done.
  expect(await chat.startRecipe(watch!, { parentSessionId: parent, task: '  ' })).toEqual({ status: 'refused', reason: 'A background recipe needs a task.' })
  await chat.startRecipe(watch!, { parentSessionId: parent, task: 'the news page' })
  await chat.startRecipe(sum!, { parentSessionId: parent, task: '1 + 2' })

  // One task runs at a time, so the second one waits.
  const statusOf = (name: string) => chat.backgroundTasks.find(task => task.recipeName === name)?.status
  await expect.poll(() => [statusOf('Watch'), statusOf('Sum')]).toEqual(['running', 'queued'])

  const watching = chat.backgroundTasks.find(task => task.recipeName === 'Watch')!
  await chat.stopBackgroundTask(watching.sessionId)

  await expect.poll(() => sessions.sessionMetas[watching.sessionId]?.task?.status).toBe('interrupted')
  await expect.poll(() => statusOf('Sum')).toBe('done')
  await expect.poll(() => prompts.some(prompt => prompt.includes('The background task \\"Sum\\" finished.'))).toBe(true)
  expect(prompts.some(prompt => prompt.includes('The background task \\"Watch\\"'))).toBe(false)
})

// ROOT CAUSE:
// Each task kept its own session forever, and deleting one through deleteSession moved the character's selected conversation.
it('keeps the sessions of only the newest finished tasks, without moving the selected conversation', async () => {
  const { chat, sessions, recipes } = await setupChat(async () => 'checked')
  recipes.add({ name: 'Check', description: 'Checks the weather.', instructions: 'Check the weather.', triggers: [], background: true, enabled: true })
  const check = recipes.recipes.find(recipe => recipe.name === 'Check')!
  const selected = sessions.activeSessionId
  const characterId = sessions.sessionMetas[selected]!.characterId

  for (let run = 0; run < 5; run++)
    await chat.startRecipe(check, { parentSessionId: selected, task: `run ${run}` })

  const taskSessions = () => Object.values(sessions.sessionMetas).filter(meta => meta.recipeId === check.id)
  await expect.poll(() => taskSessions().map(meta => meta.task?.status)).toEqual(['done', 'done', 'done'])

  await chat.dismissBackgroundTask(taskSessions()[0]!.sessionId)

  expect(taskSessions()).toHaveLength(2)
  expect(chat.backgroundTasks).toHaveLength(2)
  expect(sessions.activeSessionId).toBe(selected)
  expect(sessions.index?.characters[characterId]?.activeSessionId).toBe(selected)
})

// A background recipe runs in its own session, so its steps never enter the conversation.
// The result returns as a notice that history keeps, marked as a notice and never as owner speech.
it('runs a keyword-triggered background recipe and keeps its result as a notice', async () => {
  const { chat, sessions, recipes, prompts } = await setupChat(async prompt => prompt.includes('Ask which game, then start it.') ? 'The owner wants porridge games.' : '')
  recipes.add({ name: 'Game night', description: 'Starts a game when the owner wants to play.', instructions: 'Ask which game, then start it.', triggers: [{ kind: 'keyword', keywords: ['想玩粥了'] }], background: true, enabled: true })
  const parent = sessions.activeSessionId

  await chat.send({ sessionId: parent, text: '今天想玩粥了' })

  const ownerMessages = () => sessions.getSessionMessages(parent).filter(message => message.role === 'user')
  await expect.poll(() => ownerMessages().filter(message => message.role === 'user' && message.notice).length).toBe(1)
  expect(ownerMessages().filter(message => message.role === 'user' && !message.notice)).toHaveLength(1)
  expect(ownerMessages().find(message => message.role === 'user' && message.notice)).toMatchObject({ notice: { source: 'recipe:Game night' } })
  expect(prompts.find(prompt => prompt.includes('Ask which game, then start it.'))).toContain('The owner said: 今天想玩粥了')
  // The conversation knows that the recipe runs, and never reads its steps.
  const conversation = prompts[0]!
  expect(conversation).toContain('It runs in the background for this message')
  expect(conversation).not.toContain('Ask which game, then start it.')
})

// ROOT CAUSE:
// A triggered recipe and an armed task ran with no tools, so "do it with computer use in ten minutes" lost computer use when it ran.
// The owner approved the recipe, or asked for that run, so every recipe run uses every registered tool.
it('runs a recipe with every registered tool', async () => {
  const { pinia, chat, sessions, recipes } = await setupChat(async () => 'done')
  useLlmToolsStore(pinia).addTools({
    id: 'computer-use',
    type: 'function',
    function: { name: 'computer_use', description: 'Controls the desktop.', parameters: { type: 'object', properties: {} } },
    requiresExplicitSelection: true,
    execute: async () => 'ok',
  })
  recipes.add({ name: 'Tidy up', description: '', instructions: 'Tidy the desktop.', automation: { triggers: [{ source: 'clock', event: 'every', minutes: 10 }], conditions: [] }, triggers: [], enabled: true })
  const tidy = recipes.recipes.find(recipe => recipe.name === 'Tidy up')!

  await chat.startRecipe(tidy, { parentSessionId: sessions.activeSessionId, task: 'Local time: 10:10.' })

  const task = () => Object.values(sessions.sessionMetas).find(meta => meta.recipeId === tidy.id)
  await expect.poll(() => task() && sessions.getSessionMessages(task()!.sessionId).find(message => message.role === 'user')?.tools).toContainEqual({ name: 'computer_use' })
})
