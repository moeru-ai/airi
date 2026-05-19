import { describe, expect, it, vi } from 'vitest'

import { createOpenCollectiveProvider, rewriteOpenCollectiveAuthHeaders } from './openCollectiveProvider.js'

/**
 * @example createOpenCollectiveProvider sends OpenCollective personal tokens with the documented header.
 */
describe('createOpenCollectiveProvider', () => {
  /**
   * @example A personal token is sent as Personal-Token, not as the legacy Api-Key header.
   */
  it('uses the OpenCollective Personal-Token header for GraphQL requests', async () => {
    const originalFetch = globalThis.fetch
    const requests = []
    const fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      const headers = input instanceof Request ? input.headers : new Headers(init.headers)
      requests.push({ headers, url })

      if (requests.length === 1) {
        return jsonResponse({
          data: {
            account: {
              orders: {
                totalCount: 0,
                nodes: [],
              },
            },
          },
        })
      }

      return jsonResponse({
        data: {
          account: {
            transactions: {
              totalCount: 0,
              nodes: [],
            },
          },
        },
      })
    })

    try {
      globalThis.fetch = fetch

      const provider = createOpenCollectiveProvider()

      await provider.fetchSponsors({
        includePastSponsors: true,
        opencollective: {
          key: 'personal-token-example',
          slug: 'proj-airi',
        },
      })

      /**
       * @example expect every GraphQL request to use OpenCollective's Personal-Token auth header.
       */
      expect(requests).toHaveLength(2)
      /**
       * @example expect the first request to target OpenCollective's GraphQL endpoint.
       */
      expect(requests[0].url).toBe('https://api.opencollective.com/graphql/v2/')
      /**
       * @example expect SponsorKit not to send the deprecated Api-Key header for personal tokens.
       */
      expect(Object.fromEntries(requests[0].headers.entries())).toMatchObject({
        'content-type': 'application/json',
        'personal-token': 'personal-token-example',
      })
      /**
       * @example expect the legacy Api-Key header to be omitted.
       */
      expect(requests[0].headers.has('Api-Key')).toBe(false)
    }
    finally {
      globalThis.fetch = originalFetch
    }
  })

  /**
   * @example Existing Personal-Token headers are preserved when normalizing OpenCollective auth headers.
   */
  it('preserves existing Personal-Token headers', () => {
    const headers = rewriteOpenCollectiveAuthHeaders({
      'Api-Key': 'legacy-token',
      'Personal-Token': 'existing-personal-token',
    })

    /**
     * @example expect an explicit Personal-Token to win over the legacy Api-Key value.
     */
    expect(headers.get('Personal-Token')).toBe('existing-personal-token')
    /**
     * @example expect the legacy Api-Key header to stay when no rewrite is needed.
     */
    expect(headers.get('Api-Key')).toBe('legacy-token')
  })
})

/**
 * Creates a JSON Response object for the SponsorKit fetch mock.
 *
 * Use when:
 * - ofetch needs a content-type header to parse mocked response bodies.
 *
 * Expects:
 * - value to be JSON-serializable.
 *
 * Returns:
 * - A Response with application/json content.
 */
function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
