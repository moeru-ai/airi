import { ProvidersMap } from 'sponsorkit'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Creates a minimal OpenCollective GraphQL response for SponsorKit's fetch flow.
 *
 * @param {'orders' | 'transactions'} nodeType - The OpenCollective connection requested by SponsorKit.
 */
function createGraphqlResponse(nodeType) {
  return new Response(JSON.stringify({
    data: {
      account: {
        [nodeType]: {
          nodes: [],
          totalCount: 0,
        },
      },
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Normalizes fetch init headers so the test can assert browser-style header names.
 *
 * @param {HeadersInit | undefined} headers - Headers passed by ofetch to the platform fetch API.
 */
function normalizeHeaders(headers) {
  return new Headers(headers)
}

/**
 * @example SponsorKit sends OpenCollective personal tokens through the documented HTTP header.
 */
describe('sponsorKit OpenCollective pnpm patch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * @example A personal token is sent as Personal-Token, not as the legacy Api-Key header.
   */
  it('uses the OpenCollective Personal-Token header for GraphQL requests', async () => {
    const requests = []

    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      requests.push({
        url,
        headers: normalizeHeaders(init?.headers),
      })

      return createGraphqlResponse(requests.length === 1 ? 'orders' : 'transactions')
    }))

    await ProvidersMap.opencollective.fetchSponsors({
      includePastSponsors: true,
      opencollective: {
        key: 'personal-token-example',
        slug: 'proj-airi',
      },
    })

    /**
     * @example expect SponsorKit to request both OpenCollective orders and transactions.
     */
    expect(requests).toHaveLength(2)

    for (const request of requests) {
      /**
       * @example expect every GraphQL request to use OpenCollective's Personal-Token auth header.
       */
      expect(request.headers.get('Personal-Token')).toBe('personal-token-example')

      /**
       * @example expect SponsorKit not to send the deprecated Api-Key header for personal tokens.
       */
      expect(request.headers.has('Api-Key')).toBe(false)
    }
  })
})
