import type { MemoryExchange } from './memory-keeper'

import { errorMessageFrom } from '@moeru/std'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync/wire-message'
import { useLLM } from '@proj-airi/stage-ui/stores/ai/chat-llm/llm'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'

import { usePersonalCompanionStore } from './companion-store'
import { featuresConfig } from './features'
import { buildMemoryConversation, formatLocalMinute, parseMemoryReply } from './memory-keeper'
import { replacePromptContext } from './prompt-context'

/** Context bucket that holds the remembered facts and pending reminders. Each turn replaces it. */
const MEMORY_CONTEXT_ID = 'personal:memory'

function formatMemoryContext(facts: readonly string[], reminders: ReadonlyArray<{ title: string, dueAt: number }>): string {
  const lines: string[] = []
  if (featuresConfig.memory.enabled) {
    if (facts.length === 0)
      lines.push('You do not remember any facts about the user yet.')
    else
      lines.push('Facts that you remember about the user:', ...facts.map(fact => `- ${fact}`))
  }
  if (featuresConfig.reminders.enabled && reminders.length > 0) {
    lines.push('Reminders that you set for the user (local time):', ...reminders.map(reminder => `- ${formatLocalMinute(new Date(reminder.dueAt))}: ${reminder.title}`))
  }
  // The bucket must always get a text, so the text of the previous turn does not stay.
  if (lines.length === 0)
    return 'No reminders are pending.'
  return lines.join('\n')
}

/**
 * Starts long-term memory in this window.
 *
 * - Before each message is composed, the remembered facts and pending
 *   reminders are added to the prompt.
 * - After each completed turn, one extra chat model request asks which facts
 *   to remember or forget, and which reminders to set. The request runs in the
 *   background. Requests run one at a time, in turn order. A failed request
 *   is logged and changes nothing.
 *
 * The extra request uses the chat model of the consciousness module, without tools,
 * so it also works with models that do not support tool calls.
 *
 * @returns A function that removes both hooks. A request in progress still finishes and applies its result.
 */
export function installMemory(): () => void {
  if (!featuresConfig.memory.enabled && !featuresConfig.reminders.enabled)
    return () => {}

  const chatStore = useChatStore()
  const companionStore = usePersonalCompanionStore()
  const llm = useLLM()
  const providerStore = useProviderStore()
  const consciousnessStore = useConsciousnessStore()

  async function updateMemory(exchange: MemoryExchange, knownFactIds: readonly string[]) {
    const providerId = consciousnessStore.activeProvider
    const model = consciousnessStore.activeModel
    // Without a chat model, the companion cannot reply either. Nothing is lost by skipping.
    if (!providerId || !model)
      return

    const provider = await providerStore.getChatProviderInstance(providerId)
    const now = new Date()
    let reply = ''
    await llm.stream(model, provider, buildMemoryConversation(exchange, now), {
      supportsTools: false,
      onStreamEvent: (event) => {
        if (event.type === 'text-delta')
          reply += event.text
      },
    })

    const update = parseMemoryReply(reply, exchange.knownFacts.length, now)
    if (featuresConfig.memory.enabled) {
      // `forget` indexes point into the facts that were sent. Use their ids,
      // because the list can change while the request runs.
      for (const index of update.forget)
        companionStore.removeFact(knownFactIds[index])
      for (const text of update.remember)
        companionStore.addFact(text)
    }
    if (featuresConfig.reminders.enabled) {
      for (const reminder of update.reminders)
        companionStore.addReminder(reminder.title, reminder.dueAt)
    }
  }

  let queue = Promise.resolve()

  const stopContext = chatStore.onBeforeMessageComposed(async () => {
    replacePromptContext(MEMORY_CONTEXT_ID, formatMemoryContext(
      companionStore.facts.map(fact => fact.text),
      companionStore.pendingReminders,
    ))
  })

  const stopKeeper = chatStore.onChatTurnComplete(async (chat, context) => {
    const userMessage = extractMessageText(context.message).trim()
    if (!userMessage)
      return

    const exchange: MemoryExchange = {
      knownFacts: companionStore.facts.map(fact => fact.text),
      userMessage,
      companionReply: chat.outputText,
    }
    const knownFactIds = companionStore.facts.map(fact => fact.id)
    // The hook does not wait, so the next message is not delayed by this request.
    queue = queue
      .then(() => updateMemory(exchange, knownFactIds))
      .catch(error => console.warn('[personal] Failed to update the memory:', errorMessageFrom(error) ?? 'unknown error'))
  })

  return () => {
    stopContext()
    stopKeeper()
  }
}
