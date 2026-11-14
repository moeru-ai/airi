import type { AnalyticsAdapter } from '../analytics'

/**
 * Loads the OpenPanel and PostHog adapters and sends each call to both.
 *
 * AIRI writes product events to both providers in parallel while the two data
 * sets are compared. A content blocker can reject one provider module. The
 * other provider then still runs. The promise rejects only when no provider loads.
 */
export async function loadAnalyticsProviders(): Promise<AnalyticsAdapter> {
  const results = await Promise.allSettled([
    import('./openpanel').then(({ createOpenpanelAdapter }) => createOpenpanelAdapter()),
    import('./posthog').then(({ createPosthogAdapter }) => createPosthogAdapter()),
  ])
  const adapters = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
  if (adapters.length === 0)
    throw new Error('No analytics provider loaded')

  function forEachAdapter(call: (adapter: AnalyticsAdapter) => void): void {
    for (const adapter of adapters) {
      try {
        call(adapter)
      }
      catch {
        // One failed provider must not stop the auth flow or the other provider.
        console.warn('[analytics] An analytics provider failed')
      }
    }
  }

  return {
    capture(event, properties, options) {
      forEachAdapter(adapter => adapter.capture(event, properties, options))
    },
    identify(userId) {
      forEachAdapter(adapter => adapter.identify(userId))
    },
  }
}
