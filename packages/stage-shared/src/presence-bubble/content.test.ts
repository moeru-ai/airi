import { describe, expect, it } from 'vitest'

import {
  formatUnreadBadge,
  presenceBubbleDotCycleMs,
  presenceBubbleDotPhases,
  resolvePresenceBubbleContent,
} from './content'

describe('presence bubble content', () => {
  it('shows nothing while the character is idle', () => {
    expect(resolvePresenceBubbleContent({ thinking: false, unreadCount: 0 }, 0)).toBeUndefined()
  })

  it('puts a turn in progress ahead of a count of unread messages', () => {
    const content = resolvePresenceBubbleContent({ thinking: true, unreadCount: 14 }, 0)

    expect(content).toEqual({ kind: 'thinking', phase: 0 })
  })

  it('shows unread once the turn is over', () => {
    const content = resolvePresenceBubbleContent({ thinking: false, unreadCount: 14 }, 0)

    expect(content).toEqual({ kind: 'unread', count: 14 })
  })

  it('advances the dots in whole steps and repeats each cycle', () => {
    const half = resolvePresenceBubbleContent({ thinking: true, unreadCount: 0 }, presenceBubbleDotCycleMs / 2)
    const next = resolvePresenceBubbleContent({ thinking: true, unreadCount: 0 }, presenceBubbleDotCycleMs * 1.5)

    expect(half).toEqual({ kind: 'thinking', phase: presenceBubbleDotPhases / 2 })
    expect(next).toEqual(half)
  })
})

describe('formatUnreadBadge', () => {
  it('shows a small count as it is', () => {
    expect(formatUnreadBadge(14)).toBe('14')
  })

  it('caps a count that would widen the bubble without saying more', () => {
    expect(formatUnreadBadge(128)).toBe('99+')
  })

  it('never reports a negative count', () => {
    expect(formatUnreadBadge(-3)).toBe('0')
  })
})
