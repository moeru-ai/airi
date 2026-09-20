import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatInterruption } from './use-chat-interruption'

const mocks = vi.hoisted(() => ({
  activeSendSessionId: undefined as string | undefined,
  cancelPendingSends: vi.fn<() => Promise<void>>(),
  cancelRemoteStream: vi.fn<() => Promise<void>>(),
  interruptSpeakingFromChat: vi.fn(),
  showStopSpeakingButton: { value: false },
  stopSpeakingFromChat: vi.fn(),
  remoteStreamSessionId: undefined as string | undefined,
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatStore: () => ({
    activeSendSessionId: mocks.activeSendSessionId,
    cancelPendingSends: mocks.cancelPendingSends,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/mods/api/context-bridge', () => ({
  useContextBridgeStore: () => ({
    cancelRemoteStream: mocks.cancelRemoteStream,
    remoteStreamSessionId: mocks.remoteStreamSessionId,
  }),
}))

vi.mock('./useStopSpeakingButton', () => ({
  useStopSpeakingButton: () => ({
    interruptSpeakingFromChat: mocks.interruptSpeakingFromChat,
    showStopSpeakingButton: mocks.showStopSpeakingButton,
    stopSpeakingFromChat: mocks.stopSpeakingFromChat,
  }),
}))

describe('useChatInterruption', () => {
  beforeEach(() => {
    mocks.activeSendSessionId = undefined
    mocks.cancelPendingSends.mockReset().mockResolvedValue()
    mocks.cancelRemoteStream.mockReset().mockResolvedValue()
    mocks.interruptSpeakingFromChat.mockReset()
    mocks.showStopSpeakingButton.value = false
    mocks.stopSpeakingFromChat.mockReset()
    mocks.remoteStreamSessionId = undefined
  })

  it('replaces stop with send when the user enters a new submission', () => {
    const generating = ref(true)
    const hasSubmission = ref(false)
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating,
      hasSubmission,
      submit: vi.fn(),
    })

    expect(controls.showStopAction.value).toBe(true)

    hasSubmission.value = true

    expect(controls.showStopAction.value).toBe(false)
  })

  it('stops the active LLM request and TTS playback together', async () => {
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating: ref(true),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    await controls.stopActiveResponse()

    expect(mocks.stopSpeakingFromChat).toHaveBeenCalledTimes(1)
    expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-1')
    expect(mocks.cancelRemoteStream).toHaveBeenCalledWith('session-1')
  })

  it('stops the session that owns the response after the user switches chats', async () => {
    mocks.activeSendSessionId = 'session-1'
    mocks.showStopSpeakingButton.value = true
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    await controls.stopActiveResponse()

    expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-1')
    expect(mocks.cancelRemoteStream).toHaveBeenCalledWith('session-1')
  })

  it('stops the mirrored response session after the user switches chats', async () => {
    mocks.remoteStreamSessionId = 'session-1'
    mocks.showStopSpeakingButton.value = true
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    await controls.stopActiveResponse()

    expect(mocks.cancelRemoteStream).toHaveBeenCalledWith('session-1')
  })

  it('cancels the active response before it submits an interrupting message', async () => {
    const events: string[] = []
    mocks.cancelPendingSends.mockImplementationOnce(async () => {
      events.push('cancel')
    })
    const submit = vi.fn(async (beforeSend?: (sessionId: string) => Promise<void>) => {
      events.push('capture')
      await beforeSend?.('session-1')
      events.push('send')
    })
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating: ref(true),
      hasSubmission: ref(true),
      submit,
    })

    await controls.submitInterruptingResponse()

    expect(mocks.interruptSpeakingFromChat).toHaveBeenCalledTimes(1)
    expect(mocks.stopSpeakingFromChat).not.toHaveBeenCalled()
    expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-1')
    expect(events).toEqual(['capture', 'cancel', 'send'])
  })

  it('interrupts the response owner before sending from another session', async () => {
    mocks.activeSendSessionId = 'session-1'
    const submit = vi.fn(async (beforeSend?: (sessionId: string) => Promise<void>) => {
      await beforeSend?.('session-2')
    })
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(true),
      hasSubmission: ref(true),
      submit,
    })

    await controls.submitInterruptingResponse()

    expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-1')
  })

  it('submits directly when no response is active', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating: ref(false),
      hasSubmission: ref(true),
      submit,
    })

    await controls.submitInterruptingResponse()

    expect(mocks.cancelPendingSends).not.toHaveBeenCalled()
    expect(mocks.interruptSpeakingFromChat).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('does not cancel when the composer rejects an empty submission', async () => {
    const submit = vi.fn().mockResolvedValue(undefined)
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating: ref(true),
      hasSubmission: ref(false),
      submit,
    })

    await controls.submitInterruptingResponse()

    expect(submit).toHaveBeenCalledWith(expect.any(Function))
    expect(mocks.cancelPendingSends).not.toHaveBeenCalled()
  })
})
