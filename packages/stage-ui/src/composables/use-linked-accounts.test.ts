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
          buildCallbackURL: () => 'https://auth.airi.build/ui/profile',
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
      callbackURL: 'https://auth.airi.build/ui/profile',
      errorCallbackURL: 'https://auth.airi.build/ui/profile',
    })
  })
})
