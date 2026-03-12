import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  beginMcpApprovalSession,
  endMcpApprovalSession,
  isMcpApprovalSessionActive,
  onMcpApprovalSessionEnded,
  resetMcpApprovalSessions,
} from './mcp-approval-session'

afterEach(() => {
  resetMcpApprovalSessions()
  vi.restoreAllMocks()
})

describe('mcp approval sessions', () => {
  it('tracks approval sessions independently instead of using a single global slot', () => {
    const ended: string[] = []
    onMcpApprovalSessionEnded((sessionId) => {
      if (sessionId) {
        ended.push(sessionId)
      }
    })

    beginMcpApprovalSession('approval-a')
    beginMcpApprovalSession('approval-b')

    expect(isMcpApprovalSessionActive('approval-a')).toBe(true)
    expect(isMcpApprovalSessionActive('approval-b')).toBe(true)

    endMcpApprovalSession('approval-a')

    expect(isMcpApprovalSessionActive('approval-a')).toBe(false)
    expect(isMcpApprovalSessionActive('approval-b')).toBe(true)
    expect(ended).toEqual(['approval-a'])

    endMcpApprovalSession('approval-b')

    expect(isMcpApprovalSessionActive('approval-b')).toBe(false)
    expect(ended).toEqual(['approval-a', 'approval-b'])
  })

  it('does not notify listeners when ending an unknown session id', () => {
    const listener = vi.fn()
    onMcpApprovalSessionEnded(listener)

    endMcpApprovalSession('missing-session')

    expect(listener).not.toHaveBeenCalled()
  })
})
