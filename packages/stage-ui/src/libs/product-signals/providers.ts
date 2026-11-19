import type { AnalyticsAdapter, AnalyticsAdapterOptions } from './client'

/**
 * Sends each analytics call to every loaded provider.
 *
 * AIRI writes product events to OpenPanel and to PostHog in parallel while the
 * two data sets are compared. A provider that throws does not stop the call
 * for the other provider.
 */
function createFanoutAdapter(adapters: AnalyticsAdapter[]): AnalyticsAdapter {
  function forEachAdapter<T>(call: (adapter: AnalyticsAdapter) => T): T[] {
    const results: T[] = []
    for (const adapter of adapters) {
      try {
        results.push(call(adapter))
      }
      catch {
        console.warn('[analytics] An analytics provider failed')
      }
    }
    return results
  }

  return {
    capture(name, properties, options) {
      return forEachAdapter(adapter => adapter.capture(name, properties, options)).includes(true)
    },
    getIdentityHeaders() {
      const headers: Record<string, string> = {}
      let found = false
      for (const providerHeaders of forEachAdapter(adapter => adapter.getIdentityHeaders())) {
        if (!providerHeaders)
          continue
        Object.assign(headers, providerHeaders)
        found = true
      }
      return found ? headers : null
    },
    identify(userId) {
      forEachAdapter(adapter => adapter.identify(userId))
    },
    registerBuildInfo(buildInfo) {
      forEachAdapter(adapter => adapter.registerBuildInfo(buildInfo))
    },
    resetIdentity() {
      forEachAdapter(adapter => adapter.resetIdentity())
    },
    setCaptureEnabled(enabled) {
      return forEachAdapter(adapter => adapter.setCaptureEnabled(enabled)).includes(true)
    },
  }
}

/**
 * Loads the OpenPanel and PostHog adapters and combines them.
 *
 * Use as the loader of `configureAnalyticsAdapter` in each stage app.
 * A content blocker can reject one provider module. The other provider then
 * still runs. The promise rejects only when no provider loads.
 */
export async function loadAnalyticsProviders(options: AnalyticsAdapterOptions): Promise<AnalyticsAdapter> {
  const results = await Promise.allSettled([
    import('./openpanel').then(({ createOpenpanelAdapter }) => createOpenpanelAdapter(options)),
    import('./posthog').then(({ createPosthogAdapter }) => createPosthogAdapter(options)),
  ])
  const adapters = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value)
  if (adapters.length === 0)
    throw new Error('No analytics provider loaded')
  return createFanoutAdapter(adapters)
}
