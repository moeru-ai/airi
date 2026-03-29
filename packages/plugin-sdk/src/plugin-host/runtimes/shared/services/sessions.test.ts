import { describe, expect, it, vi } from 'vitest'

import { PluginSessionService } from './sessions'

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

describe('pluginSessionService', () => {
  it('registers, lists, gets, and removes sessions by id', () => {
    const service = new PluginSessionService<TestSession>()
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

  it('generates random session ids and incrementing module identities with sanitized plugin names', () => {
    const service = new PluginSessionService<TestSession>()

    expect(service.nextSessionIdentity('  demo-plugin  ')).toEqual({
      index: 0,
      sessionId: 'plugin-session-session-a',
      moduleIdentity: {
        id: 'demo-plugin-0',
        kind: 'plugin',
        plugin: {
          id: 'demo-plugin',
        },
      },
    })

    expect(service.nextSessionIdentity('   ')).toEqual({
      index: 1,
      sessionId: 'plugin-session-session-b',
      moduleIdentity: {
        id: 'plugin-1',
        kind: 'plugin',
        plugin: {
          id: 'plugin',
        },
      },
    })
  })
})
