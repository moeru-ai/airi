import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { useLinkedAccounts } from './use-linked-accounts'

describe('useLinkedAccounts', () => {
  it('passes the profile page URL as the OAuth link error callback URL', async () => {
    const linkSocial = vi.fn(async () => ({
      data: { status: true, redirect: false },
      error: null,
    }))

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          client: {
            listAccounts: vi.fn(async () => ({ data: [], error: null })),
            unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
            linkSocial,
          },
          isAuthenticated: ref(false),
          describeError: () => '',
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          messages: {
            listFailed: 'list failed',
            unlinkFailed: 'unlink failed',
            linkFailed: 'link failed',
            lastAccount: 'last account',
            unlinked: provider => `${provider} unlinked`,
            linkStarted: provider => `${provider} link started`,
          },
        })

        return () => null
      },
    })

    await renderToString(app)

    if (!holder.linkedAccounts)
      throw new Error('Expected linked accounts composable to initialize')

    await holder.linkedAccounts.link('github', 'GitHub')

    expect(linkSocial).toHaveBeenCalledWith({
      provider: 'github',
      callbackURL: 'https://accounts.airi.build/ui/profile',
      errorCallbackURL: 'https://accounts.airi.build/ui/profile',
    })
  })

  it('fires analytics hooks on unlink success and link handoff, but not on failure', async () => {
    const onUnlinked = vi.fn()
    const onLinkStarted = vi.fn()
    const unlinkAccount = vi.fn(async (): Promise<{ data: unknown, error: { message?: string } | null }> => ({ data: null, error: null }))
    const linkSocial = vi.fn(async (): Promise<{ data: { url?: string, redirect?: boolean, status?: boolean } | null, error: { message?: string } | null }> => ({
      data: { status: true, redirect: false },
      error: null,
    }))

    const holder: {
      linkedAccounts?: ReturnType<typeof useLinkedAccounts>
    } = {}
    const app = createSSRApp({
      setup() {
        holder.linkedAccounts = useLinkedAccounts({
          client: {
            // Two rows so `isLastSignInMethod` doesn't veto the unlink.
            listAccounts: vi.fn(async () => ({
              data: [
                { id: '1', accountId: 'a-1', providerId: 'github', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
                { id: '2', accountId: 'a-2', providerId: 'credential', createdAt: '2026-01-01T00:00:00Z', scopes: [] },
              ],
              error: null,
            })),
            unlinkAccount,
            linkSocial,
          },
          isAuthenticated: ref(false),
          describeError: () => 'boom',
          buildCallbackURL: () => 'https://accounts.airi.build/ui/profile',
          messages: {
            listFailed: 'list failed',
            unlinkFailed: 'unlink failed',
            linkFailed: 'link failed',
            lastAccount: 'last account',
            unlinked: provider => `${provider} unlinked`,
            linkStarted: provider => `${provider} link started`,
          },
          onUnlinked,
          onLinkStarted,
        })

        return () => null
      },
    })

    await renderToString(app)

    if (!holder.linkedAccounts)
      throw new Error('Expected linked accounts composable to initialize')

    await holder.linkedAccounts.refresh()
    await holder.linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)
    expect(onUnlinked).toHaveBeenCalledWith('github')

    await holder.linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
    expect(onLinkStarted).toHaveBeenCalledWith('google')

    // Failure paths must not fire the hooks — a failed unlink is not an
    // unlink, and a failed handoff never reached the provider.
    unlinkAccount.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await holder.linkedAccounts.unlink('github', 'GitHub')
    expect(onUnlinked).toHaveBeenCalledTimes(1)

    linkSocial.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
    await holder.linkedAccounts.link('google', 'Google')
    expect(onLinkStarted).toHaveBeenCalledTimes(1)
  })
})
