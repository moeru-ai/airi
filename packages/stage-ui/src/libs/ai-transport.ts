import { shallowRef } from 'vue'

/** Runtime-only transport selection. Desktop initializes this before mounting provider consumers. */
export const aiTransportRevision = shallowRef(0)
let selectedFetch: typeof fetch = (...args) => globalThis.fetch(...args)

/** Captures the path for one operation, so toggles cannot reroute an active request. */
export function getAITransportFetch(): typeof fetch {
  return selectedFetch
}

/** Invalidates local provider caches without placing executable transport state in Pinia snapshots. */
export function setAITransportFetch(fetch: typeof globalThis.fetch) {
  selectedFetch = fetch
  aiTransportRevision.value++
}
