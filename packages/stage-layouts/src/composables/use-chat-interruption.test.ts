import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatInterruption } from './use-chat-interruption'

// The store values are refs, not plain fields. `responseActive` reads them inside
// a computed, and a plain field gives that computed no dependency. It then caches
// its first result, and a test that changes the field reads the stale value.
const mocks = await vi.hoisted(async () => {
  const { shallowRef } = await import('vue')
  return {
    activeSendSessionId: shallowRef<string | undefined>(undefined),
    cancelPendingSends: vi.fn<() => Promise<void>>(),
    cancelRemoteStream: vi.fn<() => Promise<void>>(),
    interruptSpeakingFromChat: vi.fn(),
    showStopSpeakingButton: shallowRef(false),
    stopSpeakingFromChat: vi.fn(),
    liveRemoteStreamSessionId: shallowRef<string | undefined>(undefined),
    remoteStreamSessionId: shallowRef<string | undefined>(undefined),
  }
})

// The store members are getters, like the Pinia stores they stand in for. A
// computed in `useChatInterruption` re-reads them on each evaluation, so it
// keeps a dependency on the underlying refs.
vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatStore: () => ({
    get activeSendSessionId() {
      return mocks.activeSendSessionId.value
    },
    cancelPendingSends: mocks.cancelPendingSends,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/mods/api/context-bridge', () => ({
  useContextBridgeStore: () => ({
    cancelRemoteStream: mocks.cancelRemoteStream,
    get liveRemoteStreamSessionId() {
      return mocks.liveRemoteStreamSessionId.value
    },
    get remoteStreamSessionId() {
      return mocks.remoteStreamSessionId.value
    },
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
    mocks.activeSendSessionId.value = undefined
    mocks.cancelPendingSends.mockReset().mockResolvedValue()
    mocks.cancelRemoteStream.mockReset().mockResolvedValue()
    mocks.interruptSpeakingFromChat.mockReset()
    mocks.showStopSpeakingButton.value = false
    mocks.stopSpeakingFromChat.mockReset()
    mocks.liveRemoteStreamSessionId.value = undefined
    mocks.remoteStreamSessionId.value = undefined
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
    mocks.activeSendSessionId.value = 'session-1'
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
    mocks.remoteStreamSessionId.value = 'session-1'
    mocks.liveRemoteStreamSessionId.value = 'session-1'
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

  it('keeps stop available between speech segments of another session', () => {
    mocks.activeSendSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    // Gap between two segments: the visible session never generated and nothing
    // is audible, while session-1 is still waiting for its next speech segment.
    expect(mocks.showStopSpeakingButton.value).toBe(false)
    expect(controls.showStopAction.value).toBe(true)
  })

  it('stops the other session during the gap between its speech segments', async () => {
    mocks.activeSendSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    await controls.stopActiveResponse()

    expect(mocks.stopSpeakingFromChat).toHaveBeenCalledTimes(1)
    expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-1')
    expect(mocks.cancelRemoteStream).toHaveBeenCalledWith('session-1')
  })

  it('keeps stop available for a mirrored response owned by another session', () => {
    mocks.remoteStreamSessionId.value = 'session-1'
    mocks.liveRemoteStreamSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    expect(controls.showStopAction.value).toBe(true)
  })

  it('hides stop once the response owner has settled', () => {
    mocks.activeSendSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    expect(controls.showStopAction.value).toBe(true)

    // The runtime clears `activeSendSessionId` when the send ends.
    mocks.activeSendSessionId.value = undefined

    expect(controls.showStopAction.value).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2741#discussion_r4170050033
  //
  // ROOT CAUSE:
  //
  // `assistant-end` completes a background remote guard and keeps it, so the
  // guard session id outlives the response that filled it.
  //
  // Before: chat B reads that retained id, so stop stays in B.
  // After: chat B reads live remote activity, so stop leaves B.
  it('hides stop after a mirrored response completes while another chat stays in view', () => {
    mocks.remoteStreamSessionId.value = 'session-1'
    mocks.liveRemoteStreamSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(false),
      submit: vi.fn(),
    })

    expect(controls.showStopAction.value).toBe(true)

    // A background `assistant-end` completes the guard and retains it.
    mocks.liveRemoteStreamSessionId.value = undefined

    expect(controls.showStopAction.value).toBe(false)
  })

  it('hides stop when the visible session has a pending submission', () => {
    mocks.activeSendSessionId.value = 'session-1'
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(false),
      hasSubmission: ref(true),
      submit: vi.fn(),
    })

    expect(controls.showStopAction.value).toBe(false)
  })

  it('cancels the active response before it submits an interrupting message', async () => {
    const events: string[] = []
    mocks.cancelPendingSends.mockImplementationOnce(async () => {
      events.push('cancel')
    })
    const submit = vi.fn(async (hooks?: { beforeSend: (sessionId: string) => Promise<void>, afterSendStarted: (sessionId: string) => void }) => {
      events.push('capture')
      await hooks?.beforeSend('session-1')
      events.push('send')
      hooks?.afterSendStarted('session-1')
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
    mocks.activeSendSessionId.value = 'session-1'
    const submit = vi.fn(async (hooks?: { beforeSend: (sessionId: string) => Promise<void>, afterSendStarted: (sessionId: string) => void }) => {
      await hooks?.beforeSend('session-2')
      hooks?.afterSendStarted('session-2')
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

  it('hides stop until an interrupting replacement has started', async () => {
    let finishCancellation!: () => void
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve
    })
    mocks.cancelPendingSends.mockReturnValueOnce(cancellation)
    const hasSubmission = ref(true)
    const submit = vi.fn(async (hooks?: { beforeSend: (sessionId: string) => Promise<void>, afterSendStarted: (sessionId: string) => void }) => {
      hasSubmission.value = false
      await hooks?.beforeSend('session-2')
      hooks?.afterSendStarted('session-2')
    })
    const controls = useChatInterruption({
      sessionId: ref('session-2'),
      generating: ref(true),
      hasSubmission,
      submit,
    })

    const sending = controls.submitInterruptingResponse()
    await vi.waitFor(() => expect(mocks.cancelPendingSends).toHaveBeenCalledWith('session-2'))
    expect(controls.showStopAction.value).toBe(false)

    finishCancellation()
    await sending
  })

  it('ignores a duplicate submission while interruption is pending', async () => {
    let finishCancellation!: () => void
    mocks.cancelPendingSends.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))
    const submit = vi.fn(async (hooks?: { beforeSend: (sessionId: string) => Promise<void>, afterSendStarted: (sessionId: string) => void }) => {
      await hooks?.beforeSend('session-1')
      hooks?.afterSendStarted('session-1')
    })
    const controls = useChatInterruption({
      sessionId: ref('session-1'),
      generating: ref(true),
      hasSubmission: ref(true),
      submit,
    })

    const firstSubmission = controls.submitInterruptingResponse()
    await vi.waitFor(() => expect(mocks.cancelPendingSends).toHaveBeenCalledTimes(1))
    await controls.submitInterruptingResponse()

    expect(submit).toHaveBeenCalledTimes(1)
    expect(controls.showStopAction.value).toBe(false)
    finishCancellation()
    await firstSubmission
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

    expect(submit).toHaveBeenCalledWith(expect.objectContaining({
      beforeSend: expect.any(Function),
      afterSendStarted: expect.any(Function),
    }))
    expect(mocks.cancelPendingSends).not.toHaveBeenCalled()
  })
})
