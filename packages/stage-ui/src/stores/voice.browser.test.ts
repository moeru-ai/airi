import type { SpeechOutput } from '@proj-airi/core-agent'

import { defineInvoke } from '@moeru/eventa'
import { Playback } from '@proj-airi/pipelines-audio'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { getSpeechBusContext, voiceSpeechCommand } from '../services/speech/bus'
import { useLlmStreamingControlStore } from './ai/chat-llm/streaming-control'
import { useChatStore } from './chat'
import { useSpeechStore } from './modules/speech'
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
it.each(['local', 'remote'] as const)('issue #3153: disabling %s speech preserves the chat turn and its tool handlers', async (source) => {
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
  const turn = { sessionId: 'alice', turnId: `speech-disabled-${source}` }
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

  settings.enabled = false

  expect(cancelChat).not.toHaveBeenCalled()
  expect(voice.activeTurns).toEqual([turn])
  await expect.poll(() => synthesisSignal?.aborted).toBe(true)
  await expect.poll(() => stopped.mock.calls.length).toBe(1)
  await control.dispatchWith('<|CALL ["test.continue"]|>', { turnId: turn.turnId })
  expect(tool).toHaveBeenCalledOnce()
  if (source === 'local')
    expect(await voice.getSpeech(turn)!.write('Later text.')).toEqual({ status: 'closed' })
  else
    expect(await command({ ...producer, type: 'text', value: 'Later text.' })).toEqual({ status: 'closed' })
  expect(await voice.finishResponse(turn)).toBe('finished')
  expect(voice.activeTurns).toEqual([])
  expect(cancelChat).not.toHaveBeenCalled()
  await expect(generation.done).resolves.toEqual({ type: 'completed' })
})
