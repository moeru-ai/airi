import type { PiniaActionEvent, PiniaActionEventStatus } from '@proj-airi/stage-shared/types/pinia-action-event'
import type { PiniaPlugin } from 'pinia'

import { errorMessageFrom } from '@moeru/std'
import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'
import { nanoid } from 'nanoid/non-secure'

const rateTraceStorageKey = 'airi:debug:pinia-tracing'
const rateTraceIntervalMs = 5_000
const rateTraceLimit = 10

let piniaActionChannel: BroadcastChannel | undefined

interface RateTraceWindow {
  actionFailures: number
  actions: Map<string, number>
  mutations: Map<string, number>
  mutationTypes: Map<string, number>
  startedAt: number
}

let rateTraceTimer: ReturnType<typeof setInterval> | undefined
let rateTraceWindow: RateTraceWindow | undefined

function createRateTraceWindow(): RateTraceWindow {
  return {
    actionFailures: 0,
    actions: new Map(),
    mutations: new Map(),
    mutationTypes: new Map(),
    startedAt: performance.now(),
  }
}

function incrementRateTraceCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function totalRateTraceCount(counts: Map<string, number>): number {
  let total = 0
  for (const count of counts.values())
    total += count

  return total
}

function topRateTraceCounts(counts: Map<string, number>): Array<{ count: number, name: string }> {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, rateTraceLimit)
    .map(([name, count]) => ({ count, name }))
}

function reportRateTraceWindow(): void {
  const window = rateTraceWindow
  if (!window)
    return

  const actionCount = totalRateTraceCount(window.actions)
  const mutationCount = totalRateTraceCount(window.mutations)
  if (actionCount === 0 && mutationCount === 0)
    return

  const elapsedMs = performance.now() - window.startedAt
  const summary = {
    actionCount,
    actionFailures: window.actionFailures,
    actionsPerSecond: Number((actionCount * 1_000 / elapsedMs).toFixed(1)),
    elapsedMs: Math.round(elapsedMs),
    mutationCount,
    mutationsPerSecond: Number((mutationCount * 1_000 / elapsedMs).toFixed(1)),
    mutationTypes: topRateTraceCounts(window.mutationTypes),
    sourceUrl: location.href,
    topActions: topRateTraceCounts(window.actions),
    topMutations: topRateTraceCounts(window.mutations),
  }
  console.info(`[DEBUG-pinia-rate] ${JSON.stringify(summary)}`)
  window.actionFailures = 0
  window.actions.clear()
  window.mutations.clear()
  window.mutationTypes.clear()
  window.startedAt = performance.now()
}

function startRateTracing(): RateTraceWindow | undefined {
  if (!import.meta.env.DEV || typeof window === 'undefined' || window.localStorage.getItem(rateTraceStorageKey) !== 'true')
    return

  rateTraceWindow ??= createRateTraceWindow()
  if (!rateTraceTimer) {
    rateTraceTimer = setInterval(reportRateTraceWindow, rateTraceIntervalMs)
    window.addEventListener('pagehide', () => {
      clearInterval(rateTraceTimer)
      rateTraceTimer = undefined
    }, { once: true })
  }

  return rateTraceWindow
}

function emitActionEvent(
  event: Omit<PiniaActionEvent, 'status' | 'timestamp'>,
  status: PiniaActionEventStatus,
  error?: unknown,
): void {
  piniaActionChannel ??= new BroadcastChannel(piniaActionTracingChannelName)
  piniaActionChannel.postMessage({
    ...event,
    status,
    timestamp: Date.now(),
    ...(status === 'failed' ? { errorMessage: errorMessageFrom(error) ?? 'Unknown action failure' } : {}),
  })
}

/**
 * Traces Pinia action lifecycle events through a broadcast channel.
 *
 * The plugin never retains action arguments, results, or state snapshots.
 * In development, set `airi:debug:pinia-tracing` to `true` in local storage
 * before a reload to print one action and mutation rate summary every five seconds.
 */
export const piniaPluginTracing: PiniaPlugin = ({ store }) => {
  const tracedWindow = startRateTracing()

  if (tracedWindow) {
    store.$subscribe((mutation) => {
      incrementRateTraceCount(tracedWindow.mutations, mutation.storeId)
      incrementRateTraceCount(tracedWindow.mutationTypes, mutation.type)
    }, { detached: true, flush: 'sync' })
  }

  store.$onAction(({ name, after, onError }) => {
    if (tracedWindow)
      incrementRateTraceCount(tracedWindow.actions, `${store.$id}.${name}`)

    const event = {
      invocationId: nanoid(),
      storeId: store.$id,
      actionName: name,
      ...(typeof location === 'undefined' ? {} : { sourceUrl: location.href }),
    }

    emitActionEvent(event, 'started')
    after(() => emitActionEvent(event, 'completed'))
    onError((error) => {
      if (tracedWindow)
        tracedWindow.actionFailures += 1
      emitActionEvent(event, 'failed', error)
    })
  })
}
