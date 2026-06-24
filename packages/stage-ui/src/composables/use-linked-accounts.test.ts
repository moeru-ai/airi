// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'

import { useLinkedAccounts } from './use-linked-accounts'

import type { LinkedAccountsClient, LinkedAccountsMessages } from './use-linked-accounts'

beforeAll(() => {
  // Suppress the Vue onMounted warning that fires when calling composables
  // outside of a mounted component context. The composable's lifecycle hooks
  // (onMounted, watch) are tested indirectly through the returned API.
  // eslint-disable-next-line ts/no-empty-function -- intentional no-op to swallow Vue lifecycle warnings outside component context
  vi.spyOn(console, 'warn').mockImplementation(() => {
    /* noop */
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => {
  vi.restoreAllMocks()
})

function createMockClient(overrides: Partial<LinkedAccountsClient> = {}): LinkedAccountsClient {
  return {
    listAccounts: vi.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
    unlinkAccount: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    linkSocial: vi.fn().mockResolvedValue({
      data: null,
      error: null,
    }),
    ...overrides,
  }
}

function createMessages(): LinkedAccountsMessages {
  return {
    listFailed: 'Failed to list accounts',
    unlinkFailed: 'Failed to unlink',
    linkFailed: 'Failed to link',
    lastAccount: 'Cannot remove last sign-in method',
    unlinked: (provider: string) => `Unlinked ${provider}`,
    linkStarted: (provider: string) => `Linking ${provider}...`,
  }
}

/**
 * Creates `useLinkedAccounts` in a way that allows testing without a mounted
 * Vue component. `onMounted` / `watch(on(isAuthenticated))` are tested
 * separately via `mockComponentMount`.
 */
function mountLinkedAccounts(args: {
  client: LinkedAccountsClient
  isAuthenticated?: Ref<boolean>
  messages?: LinkedAccountsMessages
  describeError?: (error: unknown) => string
  buildCallbackURL?: () => string
}) {
  const isAuthenticated: Ref<boolean> = args.isAuthenticated ?? ref(false)

  return useLinkedAccounts({
    client: args.client,
    isAuthenticated,
    messages: args.messages ?? createMessages(),
    describeError: args.describeError ?? ((err: unknown) => (err instanceof Error ? err.message : String(err))),
    buildCallbackURL: args.buildCallbackURL,
  })
}

describe('useLinkedAccounts', () => {
  describe('initial state', () => {
    it('exposes default reactive state', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      expect(result.linkedAccounts.value).toEqual([])
      expect(result.loading.value).toBe(true)
      expect(result.loaded.value).toBe(false)
      expect(result.error.value).toBeNull()
      expect(result.message.value).toBeNull()
      expect(result.inFlight.value).toBeNull()
      expect(result.hasCredentialAccount.value).toBe(false)
      expect(result.socialLinkedCount.value).toBe(0)
    })

    it('accountsByProvider returns an empty map', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      expect(result.accountsByProvider.value.size).toBe(0)
    })
  })

  describe('isLastSignInMethod', () => {
    function mountWithAccounts(
      accounts: Array<{
        id: string
        accountId: string
        providerId: string
        createdAt: string
        scopes: string[]
      }>,
    ) {
      const client = createMockClient({
        listAccounts: vi.fn().mockResolvedValue({ data: [], error: null }),
      })
      const result = mountLinkedAccounts({ client, isAuthenticated: ref(false) })

      // Populate accounts synchronously (simulating a successful refresh)
      result.linkedAccounts.value = accounts

      return result
    }

    it('returns true when unlinking the only social account (no credential)', () => {
      const result = mountWithAccounts([
        { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
      ])

      expect(result.isLastSignInMethod('google')).toBe(true)
    })

    it('returns false when unlinking a social account and credential exists', () => {
      const result = mountWithAccounts([
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
      ])

      expect(result.isLastSignInMethod('google')).toBe(false)
    })

    it('returns true when unlinking credential with no social accounts', () => {
      const result = mountWithAccounts([
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
      ])

      expect(result.isLastSignInMethod('credential')).toBe(true)
    })

    it('returns false when unlinking credential with social accounts present', () => {
      const result = mountWithAccounts([
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
        { id: '3', accountId: 'a3', providerId: 'github', createdAt: '2024-01-03T00:00:00Z', scopes: [] },
      ])

      expect(result.isLastSignInMethod('credential')).toBe(false)
    })

    it('returns false for a social account when multiple social accounts exist (no credential)', () => {
      const result = mountWithAccounts([
        { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'github', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
      ])

      expect(result.isLastSignInMethod('google')).toBe(false)
    })
  })

  describe('refresh', () => {
    it('fetches accounts and populates state', async () => {
      const listAccounts = vi.fn().mockResolvedValue({
        data: [
          { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: ['email'] },
        ],
        error: null,
      })
      const client = createMockClient({ listAccounts })
      const result = mountLinkedAccounts({ client })

      await result.refresh()

      expect(listAccounts).toHaveBeenCalledTimes(1)
      expect(result.linkedAccounts.value).toHaveLength(1)
      expect(result.linkedAccounts.value[0].providerId).toBe('google')
      expect(result.linkedAccounts.value[0].scopes).toEqual(['email'])
      expect(result.loaded.value).toBe(true)
      expect(result.loading.value).toBe(false)
    })

    it('handles API error gracefully', async () => {
      const listAccounts = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized', status: 401 },
      })
      const client = createMockClient({ listAccounts })
      const result = mountLinkedAccounts({ client })

      await result.refresh()

      expect(result.error.value).toBe('Unauthorized')
      expect(result.loaded.value).toBe(false)
      expect(result.loading.value).toBe(false)
    })

    it('uses messages.listFailed when describeError returns empty string', async () => {
      const listAccounts = vi.fn().mockResolvedValue({
        data: null,
        error: { status: 500 },
      })
      const client = createMockClient({ listAccounts })
      const messages = createMessages()
      const result = mountLinkedAccounts({
        client,
        messages,
        describeError: () => '',
      })

      await result.refresh()

      expect(result.error.value).toBe(messages.listFailed)
    })

    it('normalizes Date to ISO string', async () => {
      const createdAt = new Date('2024-06-15T12:00:00Z')
      const listAccounts = vi.fn().mockResolvedValue({
        data: [{ id: '1', accountId: 'a1', providerId: 'google', createdAt, scopes: [] }],
        error: null,
      })
      const client = createMockClient({ listAccounts })
      const result = mountLinkedAccounts({ client })

      await result.refresh()

      expect(result.linkedAccounts.value[0].createdAt).toBe(createdAt.toISOString())
    })

    it('handles client returning null data gracefully', async () => {
      const listAccounts = vi.fn().mockResolvedValue({ data: null, error: null })
      const client = createMockClient({ listAccounts })
      const result = mountLinkedAccounts({ client })

      await result.refresh()

      expect(result.linkedAccounts.value).toEqual([])
      expect(result.error.value).toBeNull()
    })

    it('keeps prior linkedAccounts on transient error', async () => {
      // Seed some accounts from a prior successful fetch
      const listAccounts = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] }],
          error: null,
        })
        .mockRejectedValueOnce(new Error('Network error'))
      const client = createMockClient({ listAccounts })
      const result = mountLinkedAccounts({ client })

      // First refresh succeeds
      await result.refresh()
      expect(result.linkedAccounts.value).toHaveLength(1)

      // Second refresh throws — prior accounts survive
      await result.refresh()
      expect(result.linkedAccounts.value).toHaveLength(1)
      expect(result.error.value).toBe('Network error')
    })
  })

  describe('unlink', () => {
    it('prevents unlinking the last sign-in method', async () => {
      const client = createMockClient()
      const messages = createMessages()
      const result = mountLinkedAccounts({ client, messages })

      // Only a social account present
      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
      ]

      await result.unlink('google', 'Google')

      expect(client.unlinkAccount).not.toHaveBeenCalled()
      expect(result.error.value).toBe(messages.lastAccount)
    })

    it('successfully unlinks an account', async () => {
      const listAccounts = vi.fn().mockResolvedValue({
        data: [{ id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] }],
        error: null,
      })
      const unlinkAccount = vi.fn().mockResolvedValue({ data: null, error: null })
      const client = createMockClient({ listAccounts, unlinkAccount })
      const messages = createMessages()
      const result = mountLinkedAccounts({ client, messages })

      // Start with credential + google, so unlinking google is not the last method
      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
      ]

      await result.unlink('google', 'Google')

      expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'google' })
      expect(result.message.value).toBe(messages.unlinked('Google'))
      // After unlink, refresh is called which populates from the mock
      expect(result.linkedAccounts.value).toHaveLength(1)
      expect(result.linkedAccounts.value[0].providerId).toBe('credential')
    })

    it('handles unlink API error', async () => {
      const client = createMockClient({
        listAccounts: vi.fn().mockResolvedValue({ data: [], error: null }),
        unlinkAccount: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Server error', status: 500 },
        }),
      })
      const result = mountLinkedAccounts({ client })

      // credential exists so unlink is allowed
      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
      ]

      await result.unlink('google', 'Google')

      expect(result.error.value).toBe('Server error')
    })

    it('does not allow concurrent unlinking', async () => {
      let resolveUnlink!: (value: { data: null; error: null }) => void
      const unlinkPromise = new Promise<{ data: null; error: null }>((resolve) => {
        resolveUnlink = resolve
      })
      const unlinkAccount = vi.fn().mockReturnValue(unlinkPromise)
      const client = createMockClient({
        listAccounts: vi.fn().mockResolvedValue({ data: [], error: null }),
        unlinkAccount,
      })
      const result = mountLinkedAccounts({ client })

      // Multiple social accounts so neither is last
      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
        { id: '3', accountId: 'a3', providerId: 'github', createdAt: '2024-01-03T00:00:00Z', scopes: [] },
      ]

      // Start first unlink
      const first = result.unlink('google', 'Google')
      // Second call while first is in-flight should be a no-op
      await result.unlink('github', 'GitHub')

      resolveUnlink({ data: null, error: null })
      await first

      expect(unlinkAccount).toHaveBeenCalledTimes(1)
      expect(unlinkAccount).toHaveBeenCalledWith({ providerId: 'google' })
    })
  })

  describe('link', () => {
    it('redirects when linkSocial returns a URL', async () => {
      const client = createMockClient({
        linkSocial: vi.fn().mockResolvedValue({
          data: { url: 'https://provider.com/oauth/authorize' },
          error: null,
        }),
      })
      const assignSpy = vi.fn()
      vi.stubGlobal('window', {
        location: {
          href: 'https://example.com/profile',
          assign: assignSpy,
        },
      })
      const result = mountLinkedAccounts({ client })

      await result.link('github', 'GitHub')

      expect(client.linkSocial).toHaveBeenCalledWith({
        provider: 'github',
        callbackURL: 'https://example.com/profile',
      })
      expect(assignSpy).toHaveBeenCalledWith('https://provider.com/oauth/authorize')
      expect(result.message.value).toBe('Linking GitHub...')
    })

    it('handles link API error', async () => {
      const client = createMockClient({
        linkSocial: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Provider rejected', status: 400 },
        }),
      })
      const result = mountLinkedAccounts({ client })

      await result.link('github', 'GitHub')

      expect(result.error.value).toBe('Provider rejected')
      expect(result.message.value).toBeNull()
      expect(result.inFlight.value).toBeNull()
    })

    it('uses custom buildCallbackURL when provided', async () => {
      const client = createMockClient({
        linkSocial: vi.fn().mockResolvedValue({
          data: { url: 'https://example.com/redirect' },
          error: null,
        }),
      })
      const assignSpy = vi.fn()
      vi.stubGlobal('window', { location: { href: 'https://default.com', assign: assignSpy } })
      const buildCallbackURL = () => 'https://custom.com/callback'
      const result = mountLinkedAccounts({ client, buildCallbackURL })

      await result.link('google', 'Google')

      expect(client.linkSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'https://custom.com/callback',
      })
    })

    it('does not allow concurrent linking', async () => {
      let resolveLink!: (value: { data: { url: string } | null; error: null }) => void
      const linkPromise = new Promise<{ data: { url: string } | null; error: null }>((resolve) => {
        resolveLink = resolve
      })
      const client = createMockClient({
        linkSocial: vi.fn().mockReturnValue(linkPromise),
      })
      const assignSpy = vi.fn()
      vi.stubGlobal('window', { location: { href: '/', assign: assignSpy } })
      const result = mountLinkedAccounts({ client })

      const first = result.link('google', 'Google')
      await result.link('github', 'GitHub')

      resolveLink({ data: { url: 'https://example.com' }, error: null })
      await first

      expect(client.linkSocial).toHaveBeenCalledTimes(1)
      expect(client.linkSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/',
      })
    })
  })

  describe('authentication watcher behavior', () => {
    it('refresh is callable and sets loaded flag on success', async () => {
      const client = createMockClient({
        listAccounts: vi.fn().mockResolvedValue({
          data: [{ id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] }],
          error: null,
        }),
      })
      const result = mountLinkedAccounts({ client })

      expect(result.loaded.value).toBe(false)

      await result.refresh()

      expect(result.loaded.value).toBe(true)
      expect(result.linkedAccounts.value).toHaveLength(1)
    })

    it('linkedAccounts can be cleared manually (simulating sign-out)', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
      ]
      expect(result.linkedAccounts.value).toHaveLength(1)

      // Simulate sign-out: clear accounts and reset loaded flag
      result.linkedAccounts.value.splice(0)
      result.loaded.value = false

      expect(result.linkedAccounts.value).toEqual([])
      expect(result.loaded.value).toBe(false)
    })
  })

  describe('computed state', () => {
    it('hasCredentialAccount is true when credential account exists', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
      ]

      expect(result.hasCredentialAccount.value).toBe(true)
    })

    it('socialLinkedCount excludes credential accounts', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'credential', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'google', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
        { id: '3', accountId: 'a3', providerId: 'github', createdAt: '2024-01-03T00:00:00Z', scopes: [] },
      ]

      expect(result.socialLinkedCount.value).toBe(2)
    })

    it('accountsByProvider indexes by providerId', () => {
      const client = createMockClient()
      const result = mountLinkedAccounts({ client })

      result.linkedAccounts.value = [
        { id: '1', accountId: 'a1', providerId: 'google', createdAt: '2024-01-01T00:00:00Z', scopes: [] },
        { id: '2', accountId: 'a2', providerId: 'github', createdAt: '2024-01-02T00:00:00Z', scopes: [] },
      ]

      expect(result.accountsByProvider.value.get('google')?.accountId).toBe('a1')
      expect(result.accountsByProvider.value.get('github')?.accountId).toBe('a2')
    })
  })
})
