import { errorMessageFrom } from '@moeru/std'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync/wire-message'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useLocalStorage } from '@vueuse/core'

import { personalCharacter } from './character'
import { featuresConfig } from './features'
import { applyLocalMode, localModeConfig } from './local-mode'
import { selectLorebookEntries } from './lorebook'
import { installMemory } from './memory'
import { replacePromptContext } from './prompt-context'
import { installReminderBridge } from './reminders'

/** Context bucket that holds the lorebook facts for the current turn. Each turn replaces it. */
const LOREBOOK_CONTEXT_ID = 'personal:lorebook'

/**
 * Persisted install state of the personal character, shared by all windows
 * through local storage.
 *
 * - `cardId`: the id that the card store gave the personal card.
 * - `fingerprint`: the bundled character and local mode settings that were
 *   last applied. A new build with other settings has another fingerprint.
 */
function usePersonalInstallState() {
  return {
    cardId: useLocalStorage('personal/character-card-id', ''),
    fingerprint: useLocalStorage('personal/setup-fingerprint', ''),
  }
}

/**
 * Applies the bundled character and local mode settings when they differ from
 * the last applied build.
 *
 * - First start: adds the card and selects it.
 * - Changed files: replaces the stored card. This removes edits made to that
 *   card in Settings. The selected card does not change.
 * - Card deleted in Settings: adds it again only after the files change.
 * - Unchanged files: does nothing, so choices made in Settings stay.
 */
async function installCharacter() {
  const state = usePersonalInstallState()
  const fingerprint = JSON.stringify({ character: personalCharacter, localMode: localModeConfig })
  if (state.fingerprint.value === fingerprint)
    return

  const cardStore = useAiriCardStore()
  const modules = await applyLocalMode(localModeConfig)
  const card = {
    ...personalCharacter,
    extensions: { airi: { modules: modules ?? {}, agents: {} } },
  }

  const existingCardId = state.cardId.value
  if (existingCardId && cardStore.getCard(existingCardId)) {
    await cardStore.updateCard(existingCardId, card)
  }
  else {
    const cardId = await cardStore.addCard(card, 'import')
    state.cardId.value = cardId
    await cardStore.activateCard(cardId)
  }

  state.fingerprint.value = fingerprint
}

function formatLorebookContext(contents: string[]): string {
  if (contents.length === 0)
    return 'No lorebook facts apply to this message.'
  return ['Facts from the character lorebook:', ...contents.map(content => `- ${content}`)].join('\n')
}

/**
 * Adds the lorebook facts of the active card to the prompt context before
 * each message is composed.
 *
 * The hook runs in the window that sends the message. It replaces one context
 * bucket, so repeated registration in other windows does not add duplicates.
 *
 * @returns A function that removes the hook.
 */
function installLorebook(): () => void {
  const chatStore = useChatStore()
  const chatSessionStore = useChatSessionStore()
  const cardStore = useAiriCardStore()

  return chatStore.onBeforeMessageComposed(async (message, context) => {
    const book = cardStore.activeCard?.characterBook
    if (!book)
      return

    const history = chatSessionStore.getSessionMessages(context.sessionId).map(extractMessageText)
    const entries = selectLorebookEntries(book, history, message)
    replacePromptContext(LOREBOOK_CONTEXT_ID, formatLorebookContext(entries.map(entry => entry.content)))
  })
}

/**
 * Starts the personal companion features in a full stage window.
 *
 * Only the synchronization leader installs the character and the reminder
 * bridge, because card, provider, and notebook changes must come from one
 * window. Every full stage window adds the lorebook and memory hooks for the
 * messages that it sends.
 *
 * @returns A function that stops the hooks, watchers, and timers. Call it when the window runtime is disposed.
 */
export async function initializePersonalCompanion(options: { isLeader: boolean }): Promise<() => void> {
  const stops = [installLorebook(), installMemory()]

  if (options.isLeader) {
    try {
      await installCharacter()
    }
    catch (error) {
      // A broken personal setup must not stop the app from starting.
      console.error('[personal] Failed to install the personal character:', errorMessageFrom(error) ?? 'unknown error')
    }

    if (featuresConfig.reminders.enabled)
      stops.push(installReminderBridge())
  }

  return () => {
    for (const stop of stops)
      stop()
  }
}
