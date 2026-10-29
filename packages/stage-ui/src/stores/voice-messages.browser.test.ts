import type { VoiceMessageSnapshot } from '../libs/voice/voice-message'

import { defineInvoke } from '@moeru/eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { holdCaptureLease } from '../libs/voice/capture-lease'
import { getSpeechBusContext, voiceMessageCommand, voiceMessagesChanged } from '../services/speech/bus'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useVoiceCaptureLeaseStore } from './voice-capture-lease'
import { useVoiceMessagesStore } from './voice-messages'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/** Mounts the host store with the browser microphone adapter, then connects it and the capture leases to the speech bus, as the voice host does. */
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
  const disconnectLeases = useVoiceCaptureLeaseStore(pinia).connect()
  const snapshots: (readonly VoiceMessageSnapshot[])[] = []
  const stopSnapshots = getSpeechBusContext().on(voiceMessagesChanged, ({ body }) => {
    if (body)
      snapshots.push(body)
  })
  cleanups.push(() => {
    stopSnapshots()
    disconnectLeases()
    disconnect()
    app.unmount()
    disposePinia(pinia)
    element.remove()
  })
  return { store, leases: useVoiceCaptureLeaseStore(pinia), devices: useSettingsAudioDevice(pinia), latest: () => snapshots.at(-1) ?? [] }
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

  it('keeps a recording as a draft when another window takes the microphone', async () => {
    const { store, latest } = connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)
    await command({ type: 'record', id: 'message', sessionId: 'alice' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')

    const lease = new AbortController()
    cleanups.push(() => lease.abort())
    holdCaptureLease(lease.signal)

    await expect.poll(() => latest()[0]?.phase).toBe('ready')
    expect(store.isRecording).toBe(false)
  })

  it('does not record while another window holds the microphone', async () => {
    const { leases } = connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)
    const lease = new AbortController()
    cleanups.push(() => lease.abort())
    holdCaptureLease(lease.signal)
    await expect.poll(() => leases.held).toBe(true)

    expect(await command({ type: 'record', id: 'message', sessionId: 'alice' })).toEqual({ status: 'closed' })

    lease.abort()
    await expect.poll(() => leases.held).toBe(false)

    expect(await command({ type: 'record', id: 'message', sessionId: 'alice' })).toEqual({ status: 'accepted' })
  })

  // The microphone switch in a composer menu or in Hearing controls must stop a recording at once.
  // The user keeps the audio that was recorded before, as with a capture lease.
  it('keeps a recording as a draft and closes the microphone when the microphone turns off', async () => {
    const { store, devices, latest } = connectHost()
    // The device list decides which device the system default opens. A later list change replaces the input.
    expect(await devices.askPermission()).toBe(true)
    await expect.poll(() => devices.selectedAudioInput).not.toBe('')
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)
    await command({ type: 'record', id: 'message', sessionId: 'alice' })
    await expect.poll(() => latest()[0]?.phase).toBe('capturing')
    await expect.poll(() => devices.stream?.getAudioTracks()[0].readyState).toBe('live')
    const track = devices.stream!.getAudioTracks()[0]

    devices.off = true

    await expect.poll(() => latest()[0]?.phase).toBe('ready')
    expect(store.isRecording).toBe(false)
    await expect.poll(() => track.readyState).toBe('ended')
    // Browser test files run in parallel and share storage. Turn the persisted switch back at once.
    devices.off = false
  })

  it('does not record while the microphone is off', async () => {
    const { devices } = connectHost()
    const command = defineInvoke(getSpeechBusContext(), voiceMessageCommand)
    devices.off = true
    const refused = await command({ type: 'record', id: 'message', sessionId: 'alice' })
    // Browser test files run in parallel and share storage. Turn the persisted switch back at once.
    devices.off = false

    expect(refused).toEqual({ status: 'closed' })

    expect(await command({ type: 'record', id: 'message', sessionId: 'alice' })).toEqual({ status: 'accepted' })
  })
})
