import type { Ref } from 'vue'

import { nanoid } from 'nanoid/non-secure'
import { onScopeDispose, readonly, ref } from 'vue'

import { getSpeechBusContext, voiceListeningLease, voiceListeningLeaseQuery } from '../services/speech/bus'

/**
 * A lease lasts this long without renewal. Browsers can delay the timers of a hidden page to once a minute,
 * so the lease outlasts that delay. A closed window releases its lease, and a crashed one stops renewing it.
 */
const LEASE_MS = 90_000
const RENEW_MS = 5_000
/**
 * A new observer waits this long for the holders to answer its query, and reports a lease until then.
 * The answer crosses a BroadcastChannel, so it arrives in a later task. Timer throttling of hidden pages does not delay it.
 */
export const LEASE_DISCOVERY_MS = 250

/** One ID for each window, so that the hosts of a window ignore the lease of that window. */
const windowId = nanoid()

/**
 * Tells if another window holds a listening lease now. It asks the holders to renew at once, and reports a lease for
 * `LEASE_DISCOVERY_MS` while the answers arrive. So a window that opens during a lease of another window does not
 * listen before it learns the lease. Scope disposal stops the observation.
 */
export function useListeningLeasedElsewhere(): Readonly<Ref<boolean>> {
  const leases = new Map<string, number>()
  let discovering = true
  const leased = ref(true)
  let expiry: ReturnType<typeof setTimeout> | undefined

  function update() {
    clearTimeout(expiry)
    const now = Date.now()
    for (const [holder, until] of leases) {
      if (until <= now)
        leases.delete(holder)
    }
    leased.value = discovering || leases.size > 0
    if (leases.size)
      expiry = setTimeout(update, Math.min(...leases.values()) - now)
  }

  const bus = getSpeechBusContext()
  const stop = bus.on(voiceListeningLease, ({ body }) => {
    if (!body || body.holder === windowId)
      return
    leases.set(body.holder, body.until)
    update()
  })
  bus.emit(voiceListeningLeaseQuery, undefined)
  const discovery = setTimeout(() => {
    discovering = false
    update()
  }, LEASE_DISCOVERY_MS)
  onScopeDispose(() => {
    stop()
    clearTimeout(discovery)
    clearTimeout(expiry)
  })

  return readonly(leased)
}

/** Open claims of this window. All claims share the window ID, so the lease ends when the last one is released. */
let claims = 0
let endLease: (() => void) | undefined

function startLease() {
  const bus = getSpeechBusContext()
  const renew = () => void bus.emit(voiceListeningLease, { holder: windowId, until: Date.now() + LEASE_MS })
  const timer = setInterval(renew, RENEW_MS)
  const stopAnswering = bus.on(voiceListeningLeaseQuery, renew)
  let ended = false
  function end() {
    if (ended)
      return
    ended = true
    clearInterval(timer)
    stopAnswering()
    window.removeEventListener('pagehide', end)
    void bus.emit(voiceListeningLease, { holder: windowId, until: 0 })
  }
  window.addEventListener('pagehide', end)
  renew()
  return end
}

/**
 * Asks the voice hosts of other windows to stop listening, and renews the request until the returned function releases it.
 * Claims of one window share one lease, for example the devtool host and a diagnostic recording. The lease ends with the last release.
 * Closing the window also ends it.
 */
export function claimListeningLease(): () => void {
  claims += 1
  if (claims === 1)
    endLease = startLease()
  let released = false
  return () => {
    if (released)
      return
    released = true
    claims -= 1
    if (claims === 0) {
      endLease?.()
      endLease = undefined
    }
  }
}
