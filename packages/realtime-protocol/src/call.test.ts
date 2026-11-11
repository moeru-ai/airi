import { describe, expect, it } from 'vitest'

import { callInvite, parseCallEnded, parseCallInvite, parseCallInviteResult } from './call'

describe('call contracts', () => {
  it('gives each host its own invite event', () => {
    const first = callInvite('desktop-a')
    const second = callInvite('desktop-b')

    expect(first.sendEvent.id).not.toBe(second.sendEvent.id)
    expect(first.sendEvent.id).toContain('proj-airi:realtime:call:invite:desktop-a')
  })

  it('accepts a valid invite and its answers', () => {
    expect(parseCallInvite({ callId: 'call-1', from: 'phone-1' })).toEqual({ callId: 'call-1', from: 'phone-1' })
    expect(parseCallInviteResult({ status: 'accepted' })).toEqual({ status: 'accepted' })
    expect(parseCallInviteResult({ status: 'rejected', reason: 'busy' })).toEqual({ status: 'rejected', reason: 'busy' })
    expect(parseCallEnded({ callId: 'call-1', from: 'phone-1', reason: 'hangup' }).reason).toBe('hangup')
  })

  it('rejects a body that another app version or a wrong sender can produce', () => {
    expect(() => parseCallInvite({ callId: '', from: 'phone-1' })).toThrow()
    expect(() => parseCallInvite({ callId: 'x'.repeat(65), from: 'phone-1' })).toThrow()
    expect(() => parseCallInviteResult({ status: 'rejected' })).toThrow()
    expect(() => parseCallInviteResult({ status: 'rejected', reason: 'declined' })).toThrow()
    expect(() => parseCallEnded({ callId: 'call-1', from: 'phone-1', reason: 'lost' })).toThrow()
    expect(() => parseCallEnded(undefined)).toThrow()
  })
})
