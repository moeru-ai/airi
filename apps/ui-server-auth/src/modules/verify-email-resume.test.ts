import { describe, expect, it } from 'vitest'

import {
  broadcastMatchesContinuation,
  buildVerifyEmailBroadcastEvent,
  normalizeTrustedAuthorizeContinueUrl,
  shouldVerifiedSuccessTabNavigate,
} from './verify-email-resume'

const webAuthorize = 'https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-stage-web&response_type=code&state=abc'
const enrollAuthorize = 'https://api.airi.build/api/auth/oauth2/authorize?client_id=airi-electron&response_type=code&enrollToken=tok-1'
const attacker = 'https://attacker.example/api/auth/oauth2/authorize?enrollToken=tok-1'

describe('normalizeTrustedAuthorizeContinueUrl', () => {
  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3622919781
  it('accepts trusted authorize URLs and rejects attacker origins (PR #1966)', () => {
    expect(normalizeTrustedAuthorizeContinueUrl(webAuthorize)).toBe(webAuthorize)
    expect(normalizeTrustedAuthorizeContinueUrl(attacker)).toBeNull()
    expect(normalizeTrustedAuthorizeContinueUrl('https://api.airi.build/ui/sign-in')).toBeNull()
    expect(normalizeTrustedAuthorizeContinueUrl('not-a-url')).toBeNull()
  })
})

describe('shouldVerifiedSuccessTabNavigate', () => {
  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3627286380
  it('lets only steam enrollment continuations self-navigate from the email tab (PR #1966)', () => {
    expect(shouldVerifiedSuccessTabNavigate(enrollAuthorize)).toBe(true)
    expect(shouldVerifiedSuccessTabNavigate(webAuthorize)).toBe(false)
    expect(shouldVerifiedSuccessTabNavigate(attacker)).toBe(false)
  })
})

describe('verify-email broadcast correlation', () => {
  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3642944325
  it('ignores verified broadcasts for a different continuation (PR #1966)', () => {
    const event = buildVerifyEmailBroadcastEvent(enrollAuthorize)
    expect(event).not.toBeNull()
    expect(broadcastMatchesContinuation(event, enrollAuthorize)).toBe(true)
    expect(broadcastMatchesContinuation(event, webAuthorize)).toBe(false)
    expect(broadcastMatchesContinuation('verified', enrollAuthorize)).toBe(false)
    expect(broadcastMatchesContinuation(null, enrollAuthorize)).toBe(false)
  })
})
