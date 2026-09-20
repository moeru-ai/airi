import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatInterruption } from './use-chat-interruption'

const mocks = vi.hoisted(() => ({
  cancelPendingSends: vi.fn<() => Promise<void>>(),
  interruptSpeakingFromChat: vi.fn(),
  showStopSpeakingButton: { value: false },
  stopSpeakingFromChat: vi.fn(),
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatStore: () => ({ cancelPendingSends: mocks.cancelPendingSends }),
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
    mocks.cancelPendingSends.mockReset().mockResolvedValue()
    mocks.interruptSpeakingFromChat.mockReset()
    mocks.showStopSpeakingButton.value = false
    mocks.stopSpeakingFromChat.mockReset()
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
  })

  it('cancels the active response before it submits an interrupting message', async () => {
    const submit = vi.fn<() => Promise<void>>().mockResolvedValue()
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
    expect(mocks.cancelPendingSends.mock.invocationCallOrder[0]).toBeLessThan(submit.mock.invocationCallOrder[0]!)
  })

  it('submits directly when no response is active', async () => {
    const submit = vi.fn<() => Promise<void>>().mockResolvedValue()
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
})
