import { describe, expect, it } from 'vitest'

import { createChatActionMenuItems, createChatActionMenuTriggerState } from './menu-items'

describe('createChatActionMenuItems', () => {
  it('orders reply before the existing message actions', () => {
    const items = createChatActionMenuItems({
      canReply: true,
      canCopy: true,
      canRetry: true,
      canDelete: true,
      replyLabel: 'Reply',
    })

    expect(items.map(item => item.action)).toEqual(['reply', 'copy', 'retry', 'delete'])
    expect(items[2]?.label).toBe('Retry')
  })

  it('orders replay before reply when replay is available', () => {
    const items = createChatActionMenuItems({
      canReplay: true,
      canReply: true,
      canCopy: true,
      canRetry: false,
      canDelete: true,
      replyLabel: 'Reply',
      replayLabel: 'Replay',
    })

    expect(items.map(item => item.action)).toEqual(['replay', 'reply', 'copy', 'delete'])
    expect(items[0]?.label).toBe('Replay')
    expect(items[0]?.icon).toBe('i-solar:restart-bold')
  })

  it('omits retry when retry is unavailable', () => {
    const items = createChatActionMenuItems({
      canReply: false,
      canCopy: true,
      canRetry: false,
      canDelete: true,
      replyLabel: 'Reply',
    })

    expect(items.map(item => item.action)).toEqual(['copy', 'delete'])
  })
})

describe('createChatActionMenuTriggerState', () => {
  it('uses a success checkmark while copy feedback is active', () => {
    const state = createChatActionMenuTriggerState({ copyFeedbackActive: true })

    expect(state.icon).toBe('i-carbon:checkmark')
    expect(state.tone).toBe('success')
  })

  it('uses the default menu icon without copy feedback', () => {
    const state = createChatActionMenuTriggerState({})

    expect(state.icon).toBe('i-solar:menu-dots-bold')
    expect(state.tone).toBe('default')
  })
})
