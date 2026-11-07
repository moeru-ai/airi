import type { SpeechOutput } from '@proj-airi/core-agent'

import { defineInvoke } from '@moeru/eventa'
import { Playback } from '@proj-airi/pipelines-audio'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { getSpeechBusContext, voiceInputLevel, voiceLevelMonitor, voiceSpeechCommand } from '../services/speech/bus'
import { useLlmStreamingControlStore } from './ai/chat-llm/streaming-control'
import { useChatStore } from './chat'
import { useSpeechStore } from './modules/speech'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useSpeechOutputControlStore } from './speech-output-control'
import { useVoiceStore } from './voice'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// Cancelling a response also cancels chat generation and tool handlers. Disabling speech now cancels only its producers and playback.
it.each([
  { source: 'local', setting: 'module' },
  { source: 'remote', setting: 'module' },
  { source: 'local', setting: 'mute' },
  { source: 'remote', setting: 'mute' },
] as const)('issue #3153: disabling $setting speech for $source preserves the chat turn and its tool handlers', async ({ source, setting }) => {
  const pinia = createPinia()
  let voice!: ReturnType<typeof useVoiceStore>
  const app = createApp({ setup() {
    voice = useVoiceStore()
    return () => null
  } }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  const container = document.createElement('div')
  app.mount(container)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
  })

  const settings = useSpeechStore(pinia)
  settings.enabled = true
  const cancelChat = vi.spyOn(useChatStore(pinia), 'cancelTurn')
  const control = useLlmStreamingControlStore(pinia)
  const turn = { sessionId: 'alice', turnId: `speech-disabled-${source}-${setting}` }
  const generation = control.beginTurn({ turnId: turn.turnId })
  const tool = vi.fn()
  generation.on({ name: 'test.continue', prompt: 'Continue the task.' }, tool)

  const stopped = vi.fn(async () => ({ throughMs: 10 }))
  const played = vi.fn(() => ({ done: new Promise<{ throughMs: number }>(() => {}), stop: stopped }))
  let synthesisSignal: AbortSignal | undefined
  const output: SpeechOutput = {
    playback: new Playback({ nowMs: () => 0, play: played }),
    stream: async (_text, signal) => {
      synthesisSignal = signal
      return new ReadableStream({ start(controller) {
        controller.enqueue({ audio: new Blob(['speech']), text: 'Hello.' })
      } })
    },
  }
  cleanups.push(voice.connectOutput(() => output))
  const command = defineInvoke(getSpeechBusContext(), voiceSpeechCommand)
  const producer = { originId: 'chat-window', producerId: 'answer', turn }
  if (source === 'local') {
    voice.startResponse(turn)
    await voice.getSpeech(turn)!.write('Hello.')
  }
  else {
    await command({ ...producer, type: 'open', purpose: 'answer' })
    await command({ ...producer, type: 'text', value: 'Hello.' })
  }
  await expect.poll(() => played.mock.calls.length).toBe(1)

  if (setting === 'module')
    settings.enabled = false
  else
    useSpeechOutputControlStore(pinia).setSpeechMuted(true)

  expect(cancelChat).not.toHaveBeenCalled()
  expect(voice.activeTurns).toEqual([turn])
  await expect.poll(() => synthesisSignal?.aborted).toBe(true)
  await expect.poll(() => stopped.mock.calls.length).toBe(1)
  await control.dispatchWith('<|CALL ["test.continue"]|>', { turnId: turn.turnId })
  expect(tool).toHaveBeenCalledOnce()
  settings.enabled = true
  useSpeechOutputControlStore(pinia).setSpeechMuted(false)
  if (source === 'local')
    expect(await voice.getSpeech(turn)!.write('Later text.')).toEqual({ status: 'closed' })
  else
    expect(await command({ ...producer, type: 'text', value: 'Later text.' })).toEqual({ status: 'closed' })
  expect(await voice.finishResponse(turn)).toBe('finished')
  expect(voice.activeTurns).toEqual([])
  expect(cancelChat).not.toHaveBeenCalled()
  await expect(generation.done).resolves.toEqual({ type: 'completed' })
})

it.each(['local', 'remote'] as const)('does not create %s speech output while global output is muted', async (source) => {
  const pinia = createPinia()
  let voice!: ReturnType<typeof useVoiceStore>
  const app = createApp({ setup() {
    voice = useVoiceStore()
    return () => null
  } }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  app.mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
  })
  const settings = useSpeechStore(pinia)
  settings.enabled = true
  const controls = useSpeechOutputControlStore(pinia)
  controls.setSpeechMuted(true)
  const output: SpeechOutput = {
    playback: new Playback({ nowMs: () => 0, play: () => ({ done: Promise.resolve({ throughMs: 0 }), stop: async () => ({ throughMs: 0 }) }) }),
    stream: vi.fn(async () => new ReadableStream({ start(controller) { controller.close() } })),
  }
  const createOutput = vi.fn(() => output)
  cleanups.push(voice.connectOutput(createOutput))
  const turn = { sessionId: 'example-session', turnId: `muted-${source}` }
  const control = useLlmStreamingControlStore(pinia)
  const generation = control.beginTurn({ turnId: turn.turnId })
  const handler = vi.fn()
  generation.on({ name: 'test.continue', prompt: 'Continue.' }, handler)
  const command = defineInvoke(getSpeechBusContext(), voiceSpeechCommand)
  const producer = { originId: 'example-window', producerId: 'answer', turn }
  if (source === 'local')
    expect(voice.startResponse(turn)).toBe(false)
  else
    expect(await command({ ...producer, type: 'open', purpose: 'answer' })).toEqual({ status: 'closed' })
  expect(createOutput).not.toHaveBeenCalled()
  expect(voice.getSpeech(turn)).toBeUndefined()
  expect(voice.activeTurns).toEqual([])
  await control.dispatchWith('<|CALL ["test.continue"]|>', { turnId: turn.turnId })
  expect(handler).toHaveBeenCalledOnce()
  controls.setSpeechMuted(false)
  if (source === 'remote')
    expect(await command({ ...producer, type: 'open', purpose: 'answer' })).toEqual({ status: 'closed' })
  expect(createOutput).not.toHaveBeenCalled()
  await voice.finishResponse(turn)
  await expect(generation.done).resolves.toEqual({ type: 'completed' })
  const next = { ...turn, turnId: `next-${source}` }
  expect(voice.startResponse(next)).toBe(true)
  expect(createOutput).toHaveBeenCalledOnce()
  await voice.finishResponse(next)
})

// A level meter in a menu asks for the level when a hover opens the menu. Users saw the system microphone indicator
// turn on although microphone input was off, because the host opened the microphone for the meter.
it('publishes a requested level only while microphone input holds the microphone open', async () => {
  const pinia = createPinia()
  let voice!: ReturnType<typeof useVoiceStore>
  let devices!: ReturnType<typeof useSettingsAudioDevice>
  const app = createApp({ setup() {
    voice = useVoiceStore()
    devices = useSettingsAudioDevice()
    return () => null
  } }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  app.mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
  })
  const output: SpeechOutput = {
    playback: new Playback({ nowMs: () => 0, play: () => ({ done: new Promise<{ throughMs: number }>(() => {}), stop: async () => ({ throughMs: 0 }) }) }),
    stream: async () => new ReadableStream(),
  }
  cleanups.push(voice.connectOutput(() => output))
  devices.initialize()
  // The device list decides which device the system default opens. A later list change replaces the input.
  expect(await devices.askPermission()).toBe(true)
  await expect.poll(() => devices.selectedAudioInput).not.toBe('')
  await expect.poll(() => devices.stream).toBeUndefined()
  const context = getSpeechBusContext()
  const levels: number[] = []
  cleanups.push(context.on(voiceInputLevel, ({ body }) => body && levels.push(body.level)))
  const openMicrophone = vi.spyOn(navigator.mediaDevices, 'getUserMedia')

  context.emit(voiceLevelMonitor, { until: Date.now() + 5000 })
  await new Promise(resolve => setTimeout(resolve, 200))

  expect(openMicrophone).not.toHaveBeenCalled()
  expect(levels).toEqual([])

  devices.enabled = true
  context.emit(voiceLevelMonitor, { until: Date.now() + 10_000 })

  // The first level waits for the device and the capture worklet, which is slow while other test files run.
  await expect.poll(() => levels.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(openMicrophone).toHaveBeenCalledOnce()
  const track = devices.stream!.getAudioTracks()[0]

  // The menu still asks for the level. Turning microphone input off must close the microphone anyway.
  devices.enabled = false

  await expect.poll(() => track.readyState).toBe('ended')
})
