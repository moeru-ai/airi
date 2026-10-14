import type { ConversationMessage, ConversationTerm } from '@proj-airi/stage-ui/libs/voice/transcription-bias'

import { conversationMessagesOf, rankConversationTerms, TranscriptionBiasList } from '@proj-airi/stage-ui/libs/voice/transcription-bias'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'

const formLabels: Record<ConversationTerm['form'] | 'extra', string> = {
  quoted: 'quoted span',
  identifier: 'identifier',
  name: 'capitalized name',
  extra: 'extra source',
}

/** Lines start with `user:` or `assistant:`. A line without a role continues the previous message. */
function parseConversation(text: string): ConversationMessage[] {
  const messages: { role: string, text: string }[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(user|assistant|system)\s*:(.*)$/i.exec(line)
    if (match)
      messages.push({ role: match[1].toLowerCase(), text: match[2].trim() })
    else if (messages.length)
      messages[messages.length - 1].text += `\n${line}`
    else if (line.trim())
      messages.push({ role: 'user', text: line })
  }
  return messages
}

/**
 * Builds the bias list of a conversation, as the voice store does after each assistant turn.
 *
 * The conversation is a saved chat or pasted text. Extra phrases join as a second source, as memory will.
 * `phrases` is the merged list that Hearing sends to the provider. It updates on every edit.
 */
export function useConversationTerms() {
  const sessions = useChatSessionStore()
  const { sessionMetas, activeSessionId } = storeToRefs(sessions)
  const { userId } = storeToRefs(useAuthStore())

  const source = shallowRef<'session' | 'text'>('text')
  const pasted = shallowRef('user: I built a store with Zustand and React.js.\nassistant: Zustand works well. Did you meet the Sulfur Cube, 「硫方怪」, in Minecraft?')
  const extra = shallowRef('')
  const sessionMessages = shallowRef<readonly ConversationMessage[]>([])
  const sessionError = shallowRef<string>()

  /** The signed-in user's chats, newest first, as the sessions drawer lists them. */
  const sessionOptions = computed(() => {
    const owner = userId.value || 'local'
    return Object.values(sessionMetas.value)
      .filter(meta => meta.userId === owner)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(meta => ({
        value: meta.sessionId,
        label: `${meta.title || 'Untitled chat'} (${new Date(meta.updatedAt).toLocaleString()})${meta.sessionId === activeSessionId.value ? ' - active' : ''}`,
      }))
  })
  const selectedSessionId = shallowRef('')
  // The selection falls back to the active chat when it is empty or leaves the list, for example after an account switch.
  watch([activeSessionId, sessionOptions], ([sessionId, options]) => {
    if (!options.some(option => option.value === selectedSessionId.value))
      selectedSessionId.value = options.some(option => option.value === sessionId) ? sessionId : ''
  }, { immediate: true })

  async function loadSelectedSession() {
    sessionError.value = undefined
    const sessionId = selectedSessionId.value
    if (!sessionId) {
      sessionError.value = 'No chat is selected.'
      sessionMessages.value = []
      return
    }
    let loaded: boolean
    try {
      loaded = await sessions.loadSession(sessionId)
    }
    catch (cause) {
      loaded = false
      console.warn('[voice-pipeline] Chat load failed', cause)
    }
    // The selection can change while the session loads. Only the latest selection writes the messages.
    if (sessionId !== selectedSessionId.value)
      return
    const stored = loaded ? sessions.getSessionMessagesIfLoaded(sessionId) : undefined
    if (!stored)
      sessionError.value = 'The chat did not load.'
    sessionMessages.value = conversationMessagesOf(stored ?? [])
  }
  // A chat loads only when the saved chat is the source, so the pasted default needs no storage.
  watch([source, selectedSessionId], ([current]) => {
    if (current === 'session')
      void loadSelectedSession()
  }, { immediate: true })

  const messages = computed(() => source.value === 'session' ? sessionMessages.value : parseConversation(pasted.value))
  const terms = computed(() => rankConversationTerms(messages.value))
  const extraPhrases = computed(() => extra.value.split('\n').map(line => line.trim()).filter(Boolean))

  /** The merged list, built by the same class as the voice store, with the extra phrases as a second source. */
  const phrases = shallowRef<readonly string[]>([])
  watch([terms, extraPhrases], async ([currentTerms, currentExtra]) => {
    const list = new TranscriptionBiasList([
      { name: 'conversation', collect: async () => currentTerms.map(term => term.phrase) },
      { name: 'extra', collect: async () => currentExtra },
    ])
    await list.rebuild('devtool')
    phrases.value = list.read('devtool')?.phrases ?? []
  }, { immediate: true })

  const rows = computed(() => {
    const ranked = new Map(terms.value.map(term => [term.phrase.toLocaleLowerCase(), term]))
    return phrases.value.map((phrase) => {
      const term = ranked.get(phrase.toLocaleLowerCase())
      return { phrase, form: formLabels[term?.form ?? 'extra'], score: term?.score }
    })
  })

  return { source, pasted, extra, sessionOptions, selectedSessionId, sessionMessages, sessionError, loadSelectedSession, phrases, rows }
}
