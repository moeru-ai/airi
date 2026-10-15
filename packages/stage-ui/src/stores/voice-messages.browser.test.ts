import type { VoiceMessageSnapshot } from '../libs/voice/voice-message'

import { defineInvoke } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { LEASE_DISCOVERY_MS } from '../composables/voice-listening-lease'
import { getSpeechBusContext, voiceListeningLease, voiceMessageCommand, voiceMessagesChanged } from '../services/speech/bus'
import { useVoiceMessagesStore } from './voice-messages'

// NOTICE:
// Browser test files run in parallel pages of one origin, and a BroadcastChannel reaches all of them.
// So a lease of one file stopped recordings of another. This file gets its own speech bus.
// Remove when browser test files run in separate origins.
vi.stubGlobal('BroadcastChannel', class extends BroadcastChannel {
  constructor(name: string) {
    super(`${name}:voice-messages-test`)
  }
})

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/**
 * Mounts the host store with the browser microphone adapter, then connects its command handler to the speech bus.
 * It returns after the host has learned the listening leases of other windows, because it records nothing until then.
 */
async function connectHost() {
  const pinia = createPinia()
  let store!: ReturnType<typeof useVoiceMessagesStore>
  const app = createApp(defineComponent({ setup() {
    store = useVoiceMessagesStore()
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  const element = document.body.appendChild(document.createElement('div'))
  app.mount(element)
  const disconnect = store.connect()
  const snapshots: (readonly VoiceMessageSnapshot[])[] = []
  const stopSnapshots = getSpeechBusContext().on(voiceMessagesChanged, ({ body }) => {
    if (body)
      snapshots.push(body)
  })
  cleanups.push(() => {
    stopSnapshots()
    disconnect()
    app.unmount()
    disposePinia(pinia)
    element.remove()
  })
  await new Promise(resolve => setTimeout(resolve, LEASE_DISCOVERY_MS + 20))
  return { store, latest: () => snapshots.at(-1) ?? [] }
}

describe('voice messages host', () => {
  it('encodes and sends a finished recording, then keeps it with the send error for retry', async () => {
    const { store, latest } = await connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)

    await command({ type: 'record', id: 'message', sessionId: 'alice', replyToMessageId: 'reply-target' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')
    expect(store.isRecording).toBe(true)

    // The test has no chat session or provider, so the send fails after encoding. The host must keep the recording.
    await command({ type: 'finish', id: 'message', send: true })

    const [message] = latest()
    expect(message.phase).toBe('ready')
    expect(message.error).toBeTypeOf('string')
    expect(message.audio?.type).toBe('audio/wav')
    expect(store.isRecording).toBe(false)
  })

  // Codex review on PR #30: a recording that started before the devtool claimed the lease kept taking the speech.
  it('cancels a running recording when another window takes the lease', async () => {
    const { latest } = await connectHost()
    const bus = getSpeechBusContext()

    await defineInvoke(bus, voiceMessageCommand)({ type: 'record', id: 'message', sessionId: 'alice' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: Date.now() + 60_000 })

    await expect.poll(() => latest()).toEqual([])
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: 0 })
  })

  it('finishes without sending when the control does not ask for it', async () => {
    const { latest } = await connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)

    await command({ type: 'record', id: 'message', sessionId: 'alice' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')
    await command({ type: 'finish', id: 'message' })

    await expect.poll(() => latest()[0]?.phase).toBe('ready')
    expect(latest()[0].error).toBeUndefined()
  })
})
