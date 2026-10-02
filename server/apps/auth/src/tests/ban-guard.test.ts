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
  // Review: https://github.com/moeru-ai/airi/pull/2303
  // ROOT CAUSE:
  //
  // Better Auth generates the shared schema from registered plugin schemas.
  // The removed admin plugin declared the ban fields.
  // Without this declaration, a later generated migration can remove them.
  //
  // The ban guard now owns this schema contract.
  it('keeps ban fields in the generated schema', () => {
    expect(banGuard().schema).toMatchObject({
      user: {
        fields: {
          banned: {
            defaultValue: false,
            input: false,
            required: false,
            type: 'boolean',
          },
          banReason: {
            input: false,
            required: false,
            type: 'string',
          },
          banExpires: {
            input: false,
            required: false,
            type: 'date',
          },
        },
      },
    })
  })

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

  // Review: https://github.com/moeru-ai/airi/pull/2303
  // ROOT CAUSE:
  //
  // The old cleanup read an expired ban, then cleared it in a later write.
  // A management request can renew the ban before the cleanup write.
  // The stale write can then clear the renewed ban.
  //
  // The guard now reads the active-ban rule without writing ban state.
  it('allows an expired temporary ban without changing persisted ban state', async () => {
    const before = await getSessionCreateHook()
    const { context, updateUser } = createContext({
      banned: true,
      banExpires: new Date(Date.now() - 1000),
    })

    await expect(before(
      createSession('user-1'),
      context,
    )).resolves.toBeUndefined()

    expect(updateUser).not.toHaveBeenCalled()
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
