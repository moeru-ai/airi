import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { BUS_CHANNEL_NAME, getSpeechBusContext, voiceListeningLease, voiceListeningLeaseQuery } from '../services/speech/bus'
import { claimListeningLease, LEASE_DISCOVERY_MS, useListeningLeasedElsewhere } from './voice-listening-lease'

// NOTICE:
// Browser test files run in parallel pages of one origin, and a BroadcastChannel reaches all of them.
// So a lease of one file stopped recordings of another. This file gets its own speech bus.
// Remove when browser test files run in separate origins.
vi.stubGlobal('BroadcastChannel', class extends BroadcastChannel {
  constructor(name: string) {
    super(`${name}:listening-lease-test`)
  }
})

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Observes leases, after the discovery of the leases that hold now. */
async function observe() {
  const scope = effectScope(true)
  const leased = scope.run(() => useListeningLeasedElsewhere())!
  await wait(LEASE_DISCOVERY_MS + 20)
  return { leased, stop: () => scope.stop() }
}

/** The speech bus of another window: its own channel object, so its messages arrive in a later task. */
function otherWindowBus() {
  const channel = new BroadcastChannel(BUS_CHANNEL_NAME)
  return { bus: createContext(channel).context, close: () => channel.close() }
}

describe('useListeningLeasedElsewhere', () => {
  it('follows the lease of another window until it is released', async () => {
    const { leased, stop } = await observe()
    expect(leased.value).toBe(false)

    getSpeechBusContext().emit(voiceListeningLease, { holder: 'other-window', until: Date.now() + 60_000 })
    expect(leased.value).toBe(true)

    getSpeechBusContext().emit(voiceListeningLease, { holder: 'other-window', until: 0 })
    expect(leased.value).toBe(false)
    stop()
  })

  // Codex review on PR #30: a window that opened during a lease listened until the lease reached it.
  it('reports a lease while it waits for the answer of another window', async () => {
    const other = otherWindowBus()
    const stopHolder = other.bus.on(voiceListeningLeaseQuery, () => other.bus.emit(voiceListeningLease, { holder: 'holding-window', until: Date.now() + 60_000 }))

    const scope = effectScope(true)
    const leased = scope.run(() => useListeningLeasedElsewhere())!
    expect(leased.value).toBe(true)
    await wait(LEASE_DISCOVERY_MS + 20)
    expect(leased.value).toBe(true)

    stopHolder()
    other.bus.emit(voiceListeningLease, { holder: 'holding-window', until: 0 })
    await wait(20)
    expect(leased.value).toBe(false)
    scope.stop()
    other.close()
  })

  it('reports no lease after discovery when no window answers', async () => {
    const { leased, stop } = await observe()
    expect(leased.value).toBe(false)
    stop()
  })

  it('renews its own lease when another window asks', async () => {
    const other = otherWindowBus()
    const renewals: number[] = []
    const stopWatching = other.bus.on(voiceListeningLease, ({ body }) => body && renewals.push(body.until))
    const release = claimListeningLease()
    await wait(20)
    renewals.length = 0

    other.bus.emit(voiceListeningLeaseQuery, undefined)
    await wait(20)
    expect(renewals).toHaveLength(1)

    release()
    stopWatching()
    other.close()
  })

  it('ends a lease that is not renewed', async () => {
    const { leased, stop } = await observe()

    getSpeechBusContext().emit(voiceListeningLease, { holder: 'crashed-window', until: Date.now() + 30 })
    expect(leased.value).toBe(true)
    await wait(60)

    expect(leased.value).toBe(false)
    stop()
  })

  it('ignores the lease of its own window', async () => {
    const { leased, stop } = await observe()

    const release = claimListeningLease()
    expect(leased.value).toBe(false)
    release()
    stop()
  })

  // Codex review on PR #30: a diagnostic recording and the devtool host claim the lease in the same window.
  it('keeps the lease of a window until its last claim is released', async () => {
    const other = otherWindowBus()
    const leases: number[] = []
    const stopWatching = other.bus.on(voiceListeningLease, ({ body }) => body && leases.push(body.until))
    const releaseHost = claimListeningLease()
    const releaseRecording = claimListeningLease()

    releaseRecording()
    releaseRecording()
    await wait(20)
    expect(leases.every(until => until > Date.now())).toBe(true)

    releaseHost()
    await wait(20)
    expect(leases.at(-1)).toBe(0)
    stopWatching()
    other.close()
  })
})
