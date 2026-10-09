import { describe, expect, it } from 'vitest'

import { authorizeHandoffTarget } from './session-handoff-target'

describe('authorizeHandoffTarget', () => {
  const base = 'https://airi-server-dev.up.railway.app'

  it('accepts this server\'s authorize URL', () => {
    expect(authorizeHandoffTarget(
      `${base}/api/auth/oauth2/authorize?response_type=code&client_id=airi-stage-pocket`,
      base,
    )).toBe(`${base}/api/auth/oauth2/authorize?response_type=code&client_id=airi-stage-pocket`)
  })

  it('rejects other origins and non-authorize paths', () => {
    expect(authorizeHandoffTarget('https://evil.example/api/auth/oauth2/authorize?response_type=code&client_id=airi', base)).toBeNull()
    expect(authorizeHandoffTarget(`${base}/auth/sign-in?response_type=code&client_id=airi`, base)).toBeNull()
    expect(authorizeHandoffTarget(`${base}/api/auth/oauth2/authorize?client_id=airi`, base)).toBeNull()
  })
})
