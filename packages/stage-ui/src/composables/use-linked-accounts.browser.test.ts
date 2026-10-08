import type { LinkedAccountsClient } from './use-linked-accounts'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, ref } from 'vue'

import { useLinkedAccounts } from './use-linked-accounts'

type LinkedAccounts = ReturnType<typeof useLinkedAccounts>

function fakeLinkedAccountsClient(overrides: Partial<LinkedAccountsClient> = {}): LinkedAccountsClient {
  return {
    listAccounts: vi.fn(async () => ({ data: [], error: null })),
    unlinkAccount: vi.fn(async () => ({ data: null, error: null })),
    linkSocial: vi.fn(async () => ({ data: null, error: null })),
    linkSteam: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  }
}

/**
 * Builds a client whose link hands the user to a same-document target. The
 * document survives that assignment, which is what an Electron navigation
 * guard does to every redirect it blocks.
 */
function handoffClient(listAccounts: LinkedAccountsClient['listAccounts']): LinkedAccountsClient {
  return fakeLinkedAccountsClient({
    listAccounts,
    linkSocial: vi.fn(async () => ({ data: { url: '#link-handoff' }, error: null })),
  })
}

function mountLinkedAccounts(client: LinkedAccountsClient) {
  const holder: { linkedAccounts?: LinkedAccounts } = {}
  const app = createApp(defineComponent({
    setup() {
      holder.linkedAccounts = useLinkedAccounts({
        client,
        isAuthenticated: ref(true),
        describeError: error => String(error),
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
  }))
  app.mount(document.createElement('div'))

  if (!holder.linkedAccounts)
    throw new Error('Expected linked accounts composable to initialize')

  return { linkedAccounts: holder.linkedAccounts, unmount: () => app.unmount() }
}

describe('useLinkedAccounts after a handoff the runtime blocks', () => {
  // The handoff target is a hash on the test page. Restore the URL so later
  // tests in this file start from the same place.
  afterEach(() => {
    if (location.hash)
      history.replaceState(null, '', `${location.pathname}${location.search}`)
  })

  // Reported for stage-tamagotchi: the GitHub row keeps spinning after the
  // system browser completes the link.
  //
  // ROOT CAUSE:
  //
  // `protectPrivilegedWindowNavigation` denies the redirect, so the document
  // stayed alive and `inFlight` stayed set. We fixed this by clearing
  // `inFlight` in a `finally`, and by reading the rows when the window
  // becomes active.
  it('clears the pending state when the redirect does not unload the document', async () => {
    const { linkedAccounts, unmount } = mountLinkedAccounts(handoffClient(vi.fn(async () => ({ data: [], error: null }))))

    await linkedAccounts.link('github', 'GitHub')

    expect(location.hash).toBe('#link-handoff')
    expect(linkedAccounts.inFlight.value).toBeNull()
    unmount()
  })

  it('reloads the rows when the window regains focus', async () => {
    const listAccounts = vi.fn(async () => ({ data: [], error: null }))
    const { linkedAccounts, unmount } = mountLinkedAccounts(handoffClient(listAccounts))

    await linkedAccounts.link('github', 'GitHub')
    listAccounts.mockClear()
    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1))
    expect(linkedAccounts.inFlight.value).toBeNull()
    unmount()
  })

  it('reloads the rows when the document becomes visible again', async () => {
    const listAccounts = vi.fn(async () => ({ data: [], error: null }))
    const { linkedAccounts, unmount } = mountLinkedAccounts(handoffClient(listAccounts))

    await linkedAccounts.link('github', 'GitHub')
    listAccounts.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1))
    unmount()
  })

  it('stops listening after the first return', async () => {
    const listAccounts = vi.fn(async () => ({ data: [], error: null }))
    const { linkedAccounts, unmount } = mountLinkedAccounts(handoffClient(listAccounts))

    await linkedAccounts.link('github', 'GitHub')
    listAccounts.mockClear()
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(1))
    window.dispatchEvent(new Event('focus'))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(listAccounts).toHaveBeenCalledTimes(1)
    unmount()
  })
})
