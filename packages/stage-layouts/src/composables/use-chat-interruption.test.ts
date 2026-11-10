import type { ChatInterruptionOptions } from './use-chat-interruption'

import { defineInvokeHandler } from '@moeru/eventa'
import { getSpeechBusContext, voiceGetTurns, voiceInterrupt, voiceTurnsChanged } from '@proj-airi/stage-ui/services/speech/bus'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatInterruption } from './use-chat-interruption'
import { useStopSpeakingButton } from './useStopSpeakingButton'

const cleanups: (() => void)[] = []

function mountControls(options: ChatInterruptionOptions) {
  const pinia = createPinia()
  setActivePinia(pinia)
  let controls!: ReturnType<typeof useChatInterruption>
  let speech!: ReturnType<typeof useStopSpeakingButton>
  const app = createApp(defineComponent({ setup() {
    controls = useChatInterruption(options)
    speech = useStopSpeakingButton()
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  const element = document.createElement('div')
  document.body.append(element)
  app.mount(element)
  cleanups.push(() => {
    app.unmount()
    element.remove()
    disposePinia(pinia)
  })
  useChatSessionStore().activeSessionId = options.sessionId.value
  return { controls, speech, output: useSpeechOutputControlStore() }
}

function connectHost(receipt: Promise<{ status: 'recorded' | 'failed' }> = Promise.resolve({ status: 'recorded' })) {
  const context = getSpeechBusContext()
  const turns = [{ sessionId: 'alice', turnId: 'a' }, { sessionId: 'bob', turnId: 'b' }]
  const interrupt = vi.fn((_request: { turns: readonly { sessionId: string, turnId: string }[], cause: string }) => receipt)
  cleanups.push(defineInvokeHandler(context, voiceGetTurns, () => turns))
  cleanups.push(defineInvokeHandler(context, voiceInterrupt, interrupt))
  context.emit(voiceTurnsChanged, turns)
  return interrupt
}

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

describe('chat interruption controls', () => {
  it('shows stop for the selected session and sends the captured submission only after interruption completes', async () => {
    const sessionId = ref('alice')
    const hasSubmission = ref(false)
    const sent: string[] = []
    const submit: ChatInterruptionOptions['submit'] = async (hooks) => {
      const target = sessionId.value
      await hooks?.beforeSend(target)
      sent.push(target)
      hooks?.afterSendStarted(target)
    }
    const { controls } = mountControls({ sessionId, generating: ref(false), hasSubmission, submit })
    const receipt = Promise.withResolvers<{ status: 'recorded' }>()
    const interrupt = connectHost(receipt.promise)
    expect(controls.showStopAction.value).toBe(true)
    hasSubmission.value = true
    expect(controls.showStopAction.value).toBe(false)
    const sending = controls.submitInterruptingResponse()
    sessionId.value = 'bob'
    await vi.waitFor(() => expect(interrupt).toHaveBeenCalledTimes(1))
    expect(interrupt.mock.calls[0]?.[0].turns).toEqual([{ sessionId: 'alice', turnId: 'a' }])
    expect(sent).toEqual([])
    await controls.submitInterruptingResponse()
    expect(interrupt).toHaveBeenCalledTimes(1)
    receipt.resolve({ status: 'recorded' })
    await sending
    expect(sent).toEqual(['alice'])
  })

  it('stops the visible session first when it owns an active turn', async () => {
    const { controls } = mountControls({ sessionId: ref('bob'), generating: ref(false), hasSubmission: ref(false), submit: vi.fn() })
    const interrupt = connectHost()
    await controls.stopActiveResponse()
    expect(interrupt.mock.calls[0]?.[0].turns).toEqual([{ sessionId: 'bob', turnId: 'b' }])
  })

  // https://github.com/moeru-ai/airi/issues/2699
  it('keeps stop for the latest response of another session after the user switches chats', async () => {
    const { controls } = mountControls({ sessionId: ref('carol'), generating: ref(false), hasSubmission: ref(false), submit: vi.fn() })
    const interrupt = connectHost()
    expect(controls.showStopAction.value).toBe(true)
    await controls.stopActiveResponse()
    expect(interrupt.mock.calls[0]?.[0].turns).toEqual([{ sessionId: 'bob', turnId: 'b' }])
    getSpeechBusContext().emit(voiceTurnsChanged, [])
    expect(controls.showStopAction.value).toBe(false)
  })

  it('does not interrupt another session when the visible chat sends', async () => {
    const submit = vi.fn(async () => {})
    const { controls } = mountControls({ sessionId: ref('carol'), generating: ref(false), hasSubmission: ref(true), submit })
    const interrupt = connectHost()
    await controls.submitInterruptingResponse()
    expect(submit).toHaveBeenCalledWith()
    expect(interrupt).not.toHaveBeenCalled()
  })

  it('retains the replacement when interruption fails', async () => {
    const sent = vi.fn()
    const { controls } = mountControls({ sessionId: ref('alice'), generating: ref(true), hasSubmission: ref(true), submit: async (hooks) => {
      await hooks?.beforeSend('alice')
      sent()
    } })
    connectHost(Promise.resolve({ status: 'failed' }))
    await expect(controls.submitInterruptingResponse()).rejects.toThrow('Response interruption failed')
    expect(sent).not.toHaveBeenCalled()
  })

  it('sends directly when idle and does not interrupt rejected empty submissions', async () => {
    const generating = ref(false)
    const submit = vi.fn(async () => {})
    const { controls } = mountControls({ sessionId: ref('alice'), generating, hasSubmission: ref(false), submit })
    const interrupt = connectHost()
    getSpeechBusContext().emit(voiceTurnsChanged, [])
    await controls.submitInterruptingResponse()
    expect(submit).toHaveBeenCalledWith()
    generating.value = true
    await controls.submitInterruptingResponse()
    expect(interrupt).not.toHaveBeenCalled()
  })

  it('keeps mute separate from external interruption and targets all sessions only on explicit request', async () => {
    const { speech, output } = mountControls({ sessionId: ref('alice'), generating: ref(false), hasSubmission: ref(false), submit: vi.fn() })
    const interrupt = connectHost()
    await speech.toggleSpeechMuted()
    expect(output.speechMuted).toBe(true)
    expect(interrupt).not.toHaveBeenCalled()
    await speech.stopAllSpeaking()
    expect(interrupt.mock.calls[0]?.[0].turns).toEqual([{ sessionId: 'alice', turnId: 'a' }, { sessionId: 'bob', turnId: 'b' }])
  })
})
