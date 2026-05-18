import { ProvidersMap } from 'sponsorkit'

const OPEN_COLLECTIVE_GRAPHQL_ENDPOINT = 'https://api.opencollective.com/graphql/v2/'

/**
 * Creates an OpenCollective SponsorKit provider that sends personal tokens correctly.
 *
 * Use when:
 * - SponsorKit fetches OpenCollective sponsors from GitHub Actions.
 * - The configured OpenCollective token is a `pt_` personal token.
 *
 * Expects:
 * - SponsorKit's OpenCollective provider to keep the normal sponsor parsing behavior.
 *
 * Returns:
 * - A SponsorKit-compatible provider object.
 */
export function createOpenCollectiveProvider() {
  return {
    name: 'opencollective',
    async fetchSponsors(config) {
      const originalFetch = globalThis.fetch

      globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
        if (url !== OPEN_COLLECTIVE_GRAPHQL_ENDPOINT)
          return originalFetch(input, init)

        if (input instanceof Request) {
          return originalFetch(new Request(input, {
            headers: rewriteOpenCollectiveAuthHeaders(input.headers),
          }), init)
        }

        return originalFetch(input, {
          ...init,
          headers: rewriteOpenCollectiveAuthHeaders(init.headers),
        })
      }

      try {
        return await ProvidersMap.opencollective.fetchSponsors(config)
      }
      finally {
        globalThis.fetch = originalFetch
      }
    },
  }
}

/**
 * Normalizes OpenCollective auth headers.
 *
 * Before:
 * - `{ "Api-Key": "pt_example" }`
 *
 * After:
 * - `{ "Personal-Token": "pt_example" }`
 */
export function rewriteOpenCollectiveAuthHeaders(headers = {}) {
  const normalizedHeaders = new Headers(headers)
  const legacyApiKey = normalizedHeaders.get('Api-Key')

  if (legacyApiKey && !normalizedHeaders.has('Personal-Token')) {
    // NOTICE:
    // OpenCollective personal tokens are rejected when sent through SponsorKit's legacy Api-Key header.
    // SponsorKit 17.1.0 still sends `Api-Key` in `node_modules/.pnpm/sponsorkit@17.1.0/node_modules/sponsorkit/dist/shared/sponsorkit.D4Gzyh4z.mjs`.
    // Source/context: OpenCollective token page says to pass personal tokens as the `Personal-Token` HTTP header.
    // Removal condition: delete this wrapper after upstream SponsorKit supports `Personal-Token`.
    normalizedHeaders.set('Personal-Token', legacyApiKey)
    normalizedHeaders.delete('Api-Key')
  }

  return normalizedHeaders
}
