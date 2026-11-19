import type { Pinia } from 'pinia'

/**
 * Counts the store actions of a Pinia that have not settled yet.
 *
 * Use when:
 * - A test must let the store work that it started finish before it disposes its Pinia
 *
 * Expects:
 * - The call happens before the tracked stores are created
 *
 * Returns:
 * - A function that reads the current count
 */
export function trackPendingActions(pinia: Pinia, accepts: (storeId: string, action: string) => boolean = () => true) {
  let pending = 0
  pinia.use(({ store }) => {
    store.$onAction(({ name, after, onError }) => {
      if (!accepts(store.$id, name))
        return
      pending++
      after(() => {
        pending--
      })
      onError(() => {
        pending--
      })
    }, true)
  })
  return () => pending
}
