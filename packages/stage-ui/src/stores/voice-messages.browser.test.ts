import type { VoiceMessageSnapshot } from '../libs/voice/voice-message'

import { defineInvoke } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { getSpeechBusContext, voiceMessageCommand, voiceMessagesChanged } from '../services/speech/bus'
import { useVoiceMessagesStore } from './voice-messages'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/** Mounts the host store with the browser microphone adapter, then connects its command handler to the speech bus. */
function connectHost() {
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
  return { store, latest: () => snapshots.at(-1) ?? [] }
}

describe('voice messages host', () => {
  it('encodes and sends a finished recording, then keeps it with the send error for retry', async () => {
    const { store, latest } = connectHost()
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

  it('finishes without sending when the control does not ask for it', async () => {
    const { latest } = connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)

    await command({ type: 'record', id: 'message', sessionId: 'alice' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')
    await command({ type: 'finish', id: 'message' })

    await expect.poll(() => latest()[0]?.phase).toBe('ready')
    expect(latest()[0].error).toBeUndefined()
  })
})
