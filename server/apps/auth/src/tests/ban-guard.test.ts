import type { BetterAuthOptions } from 'better-auth'

import { describe, expect, it, vi } from 'vitest'

import { banGuard } from '../plugins/ban-guard'

type SessionCreateHook = NonNullable<NonNullable<NonNullable<BetterAuthOptions['databaseHooks']>['session']>['create']>['before']
type BanSessionCreateHook = NonNullable<SessionCreateHook>
type BanSession = Parameters<BanSessionCreateHook>[0]
type BanContext = Parameters<BanSessionCreateHook>[1]

async function getSessionCreateHook(): Promise<BanSessionCreateHook> {
  const initialized = await banGuard().init?.({} as never)
  const before = initialized?.options?.databaseHooks?.session?.create?.before
  if (!before)
    throw new TypeError('Expected the ban guard to register a session-create hook')
  return before
}

function createContext(user: { banned: boolean, banExpires: Date | null }) {
  const updateUser = vi.fn()
  return {
    updateUser,
    context: {
      context: {
        internalAdapter: {
          findUserById: vi.fn(async () => user),
          updateUser,
        },
      },
    } as unknown as BanContext,
  }
}

function createSession(userId: string): BanSession {
  const now = new Date()
  return {
    id: 'session-1',
    token: 'session-token',
    userId,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  }
}

describe('banGuard', () => {
  it('allows a session for an account that is not banned', async () => {
    const before = await getSessionCreateHook()
    const { context, updateUser } = createContext({ banned: false, banExpires: null })

    await expect(before(
      createSession('user-1'),
      context,
    )).resolves.toBeUndefined()

    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects a session for an account with a permanent ban', async () => {
    const before = await getSessionCreateHook()
    const { context, updateUser } = createContext({ banned: true, banExpires: null })

    await expect(before(
      createSession('user-1'),
      context,
    )).rejects.toMatchObject({
      body: {
        code: 'BANNED_USER',
      },
    })

    expect(updateUser).not.toHaveBeenCalled()
  })

  it('clears an expired temporary ban before it creates a session', async () => {
    const before = await getSessionCreateHook()
    const { context, updateUser } = createContext({
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    })

    await expect(before(
      createSession('user-1'),
      context,
    )).resolves.toBeUndefined()

    expect(updateUser).toHaveBeenCalledWith('user-1', {
      banned: false,
      banReason: null,
      banExpires: null,
    })
  })

  it('rejects a session for an account with an active temporary ban', async () => {
    const before = await getSessionCreateHook()
    const { context, updateUser } = createContext({
      banned: true,
      banExpires: new Date(Date.now() + 60 * 1000),
    })

    await expect(before(
      createSession('user-1'),
      context,
    )).rejects.toMatchObject({
      body: {
        code: 'BANNED_USER',
      },
    })

    expect(updateUser).not.toHaveBeenCalled()
  })
})
