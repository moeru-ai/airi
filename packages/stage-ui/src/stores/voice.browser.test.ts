import { defineInvoke } from '@moeru/eventa'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'

import { LEASE_DISCOVERY_MS } from '../composables/voice-listening-lease'
import { getSpeechBusContext, voiceInputCommand, voiceListeningLease, voiceMessageCommand, voiceRequestSnapshot, voiceSnapshotChanged } from '../services/speech/bus'
import { useHearingStore } from './modules/hearing'
import { useVoiceStore } from './voice'
import { useVoiceMessagesStore } from './voice-messages'

// NOTICE:
// Browser test files run in parallel pages of one origin, and a BroadcastChannel reaches all of them.
// So a lease of one file stopped recordings of another. This file gets its own speech bus.
// Remove when browser test files run in separate origins.
vi.stubGlobal('BroadcastChannel', class extends BroadcastChannel {
  constructor(name: string) {
    super(`${name}:voice-store-test`)
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }),
}))

/** Connects an output host and reports whether it answers a snapshot request of another window. */
async function answersSnapshotRequest(options: { windowOnly?: boolean }) {
  setActivePinia(createPinia())
  // No turn reaches this host, so the output factory never runs.
  const disconnect = useVoiceStore().connectOutput(() => {
    throw new Error('The test sends no turn')
  }, options)
  const bus = getSpeechBusContext()
  const snapshots: unknown[] = []
  const stop = bus.on(voiceSnapshotChanged, ({ body }) => snapshots.push(body))

  bus.emit(voiceRequestSnapshot, undefined)
  await new Promise(resolve => setTimeout(resolve, 20))
  stop()
  disconnect()
  return snapshots.length > 0
}

describe('useVoiceStore().connectOutput', () => {
  // Codex review on PR #30: a devtool host in a second window took commands that the main window host also took.
  it('serves other windows only when the host is not window-only', async () => {
    expect(await answersSnapshotRequest({})).toBe(true)
    expect(await answersSnapshotRequest({ windowOnly: true })).toBe(false)
  })

  // Codex review on PR #30: controls of the main window started dictation beside the devtool host that held the lease.
  it('starts no input or voice message for a control while another window holds the lease', async () => {
    setActivePinia(createPinia())
    const disconnect = useVoiceStore().connectOutput(() => {
      throw new Error('The test sends no turn')
    })
    useVoiceMessagesStore()
    const bus = getSpeechBusContext()
    await new Promise(resolve => setTimeout(resolve, LEASE_DISCOVERY_MS + 20))
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: Date.now() + 60_000 })

    const begin = await defineInvoke(bus, voiceInputCommand)({ type: 'begin', requestId: 'request-1', sessionId: 'session-1' })
    const record = await defineInvoke(bus, voiceMessageCommand)({ type: 'record', id: 'message-1', sessionId: 'session-1' })

    expect(begin).toEqual({ status: 'closed' })
    expect(record).toEqual({ status: 'closed' })
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: 0 })
    disconnect()
  })

  // Codex review on PR #30: a recording that started before the devtool claimed the lease kept taking the speech.
  it('stops the inputs of controls when another window takes the lease', async () => {
    setActivePinia(createPinia())
    const disconnect = useVoiceStore().connectOutput(() => {
      throw new Error('The test sends no turn')
    })
    // A transcriber that waits, so the input stays open until something stops it.
    vi.spyOn(useHearingStore(), 'createTranscriber').mockReturnValue({ transcribe: () => new ReadableStream() })
    const bus = getSpeechBusContext()
    let phase: string | undefined
    const stop = bus.on(voiceSnapshotChanged, ({ body }) => phase = body?.input?.phase)
    await new Promise(resolve => setTimeout(resolve, LEASE_DISCOVERY_MS + 20))

    await defineInvoke(bus, voiceInputCommand)({ type: 'begin', requestId: 'request-1', sessionId: 'session-1' })
    expect(phase).toBe('pending')
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: Date.now() + 60_000 })

    await expect.poll(() => phase).toBe('settled')
    bus.emit(voiceListeningLease, { holder: 'devtool-window', until: 0 })
    stop()
    disconnect()
  })
})
