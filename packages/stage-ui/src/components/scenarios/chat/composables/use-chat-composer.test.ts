import type { ChatHistoryReplyPayload } from '../reply'

import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import { useChatComposer } from './use-chat-composer'

describe('useChatComposer', () => {
  it('sends a native reply without changing the draft text', async () => {
    const activeSessionId = shallowRef('session-1')
    const send = vi.fn().mockResolvedValue(undefined)
    const composer = useChatComposer({ activeSessionId, send })
    const target: ChatHistoryReplyPayload = {
      label: 'AIRI',
      message: { id: 'assistant-1', role: 'assistant', content: 'Reply target', slices: [], tool_results: [] },
    }
    composer.draft.value = 'My answer'
    composer.selectReply(target)

    await expect(composer.submit()).resolves.toBe('sent')

    expect(send).toHaveBeenCalledWith({
      attachments: [],
      sessionId: 'session-1',
      replyToMessageId: 'assistant-1',
      text: 'My answer',
    })
    expect(composer.draft.value).toBe('')
    expect(composer.replyTarget.value).toBeUndefined()
  })

  it('restores a failed send without replacing newer input state', async () => {
    const activeSessionId = shallowRef('session-1')
    const firstTarget: ChatHistoryReplyPayload = {
      label: 'AIRI',
      message: { id: 'assistant-1', role: 'assistant', content: 'First', slices: [], tool_results: [] },
    }
    const secondTarget: ChatHistoryReplyPayload = {
      label: 'You',
      message: { id: 'user-2', role: 'user', content: 'Second' },
    }
    let composer: ReturnType<typeof useChatComposer>
    const send = vi.fn(async () => {
      composer.draft.value = 'New draft'
      composer.selectReply(secondTarget)
      throw new Error('Provider failed')
    })
    composer = useChatComposer({ activeSessionId, send })
    composer.draft.value = 'My answer'
    composer.selectReply(firstTarget)

    await expect(composer.submit()).resolves.toBe('restored')

    expect(composer.draft.value).toBe('My answer\nNew draft')
    expect(composer.replyTarget.value).toStrictEqual(secondTarget)
  })

  it('discards a failed snapshot after the active session changes', async () => {
    const activeSessionId = shallowRef('session-1')
    const send = vi.fn(async () => {
      activeSessionId.value = 'session-2'
      throw new Error('Provider failed')
    })
    const composer = useChatComposer<string>({ activeSessionId, send })
    composer.draft.value = 'Old draft'
    composer.addAttachments('blob:old')

    await expect(composer.submit()).resolves.toBe('discarded')

    expect(composer.draft.value).toBe('')
    expect(composer.attachments.value).toEqual([])
  })

  it('clears only the reply target that matches the deleted message', () => {
    const target: ChatHistoryReplyPayload = {
      label: 'AIRI',
      message: { id: 'assistant-2', role: 'assistant', content: 'Target', slices: [], tool_results: [] },
    }
    const composer = useChatComposer({ activeSessionId: shallowRef('session-1'), send: vi.fn() })
    composer.selectReply(target)

    composer.clearReplyForMessage({ id: 'user-1', role: 'user', content: 'Earlier message' })
    expect(composer.replyTarget.value).toStrictEqual(target)

    composer.clearReplyForMessage({ id: 'assistant-2', role: 'assistant', content: 'Updated target', slices: [], tool_results: [] })
    expect(composer.replyTarget.value).toBeUndefined()
  })
})
