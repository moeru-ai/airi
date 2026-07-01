import { describe, expect, it, vi } from 'vitest'

import { ExtensionSessionService } from './extension-sessions'

vi.mock('nanoid/non-secure', () => ({
  nanoid: vi
    .fn()
    .mockReturnValueOnce('session-a')
    .mockReturnValueOnce('session-b'),
}))

interface TestSession {
  id: string
  state: 'active' | 'closed'
}

describe('extensionSessionService', () => {
  it('registers, lists, gets, and removes sessions by id', () => {
    const service = new ExtensionSessionService<TestSession>()
    const firstSession: TestSession = { id: 'session-1', state: 'active' }
    const secondSession: TestSession = { id: 'session-2', state: 'closed' }

    expect(service.list()).toEqual([])
    expect(service.get('missing')).toBeUndefined()

    expect(service.register(firstSession)).toBe(firstSession)
    expect(service.register(secondSession)).toBe(secondSession)
    expect(service.list()).toEqual([firstSession, secondSession])
    expect(service.get('session-1')).toBe(firstSession)
    expect(service.get('session-2')).toBe(secondSession)

    expect(service.remove('session-1')).toBe(firstSession)
    expect(service.list()).toEqual([secondSession])
    expect(service.get('session-1')).toBeUndefined()
    expect(service.remove('session-1')).toBeUndefined()
  })

  it('generates random session ids with incrementing indexes', () => {
    const service = new ExtensionSessionService<TestSession>()

    expect(service.nextSessionIdentity()).toEqual({
      index: 0,
      sessionId: 'extension-session-session-a',
    })

    expect(service.nextSessionIdentity()).toEqual({
      index: 1,
      sessionId: 'extension-session-session-b',
    })
  })
})
