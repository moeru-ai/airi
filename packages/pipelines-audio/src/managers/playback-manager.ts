import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackItem,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '../types'

import { errorMessageFrom } from '@moeru/std'

export type OverflowPolicy = 'queue' | 'reject' | 'steal-oldest' | 'steal-lowest-priority'

export type OwnerOverflowPolicy = 'reject' | 'steal-oldest'

interface ActivePlayback<TAudio> {
  item: PlaybackItem<TAudio>
  controller: AbortController
  startedAt: number
}

interface WaitingPlayback<TAudio> {
  item: PlaybackItem<TAudio>
  enqueuedAt: number
}

type Listener<T> = (event: T) => void

export interface PlaybackManagerOptions<TAudio> {
  play: (
    item: PlaybackItem<TAudio>,
    signal: AbortSignal,
  ) => Promise<void>

  maxVoices?: number
  maxVoicesPerOwner?: number
  overflowPolicy?: OverflowPolicy
  ownerOverflowPolicy?: OwnerOverflowPolicy
}

export function createPlaybackManager<TAudio>(
  options: PlaybackManagerOptions<TAudio>,
) {
  const maxVoices = Math.max(1, options.maxVoices ?? 1)
  const maxVoicesPerOwner = options.maxVoicesPerOwner != null
    ? Math.max(1, options.maxVoicesPerOwner)
    : undefined
  const overflowPolicy = options.overflowPolicy ?? 'queue'
  const ownerOverflowPolicy = options.ownerOverflowPolicy ?? 'steal-oldest'
  const active = new Map<string, ActivePlayback<TAudio>>()
  const waiting: WaitingPlayback<TAudio>[] = []
  const listeners = {
    start: new Set<Listener<PlaybackStartEvent<TAudio>>>(),
    end: new Set<Listener<PlaybackEndEvent<TAudio>>>(),
    interrupt: new Set<Listener<PlaybackInterruptEvent<TAudio>>>(),
    reject: new Set<Listener<PlaybackRejectEvent<TAudio>>>(),
  }

  function subscribe<T>(bucket: Set<Listener<T>>, listener: Listener<T>) {
    bucket.add(listener)

    return () => {
      bucket.delete(listener)
    }
  }

  function emit<T>(bucket: Set<Listener<T>>, event: T) {
    for (const listener of [...bucket])
      listener(event)
  }

  function exists(id: string) {
    return (
      active.has(id)
      || waiting.some(
        x => x.item.id === id,
      )
    )
  }

  function ownerCount(ownerId?: string) {
    if (!ownerId)
      return 0

    let count = 0
    for (const x of active.values()) {
      if (x.item.ownerId === ownerId) {
        count++
      }
    }

    return count
  }

  function canStart(item: PlaybackItem<TAudio>):
    | 'overflow'
    | 'owner-overflow'
    | undefined {
    if (
      maxVoicesPerOwner
      && item.ownerId
      && ownerCount(item.ownerId)
      >= maxVoicesPerOwner
    ) {
      return 'owner-overflow'
    }

    if (active.size >= maxVoices)
      return 'overflow'

    return undefined
  }

  function pickVictim(
    predicate?: (
      x: ActivePlayback<TAudio>,
    ) => boolean,

    compare?: (
      a: ActivePlayback<TAudio>,
      b: ActivePlayback<TAudio>,
    ) => boolean,
  ) {
    let victim:
      | ActivePlayback<TAudio>
      | undefined

    for (const x of active.values()) {
      if (predicate && !predicate(x)) {
        continue
      }

      if (!victim || (compare && compare(x, victim))) {
        victim = x
      }
    }

    return victim
  }

  function finalize(entry: ActivePlayback<TAudio>, interrupted?: string, options?: { allowStartWaiting?: boolean }) {
    if (!active.delete(entry.item.id)) {
      return
    }

    if (interrupted) {
      emit(
        listeners.interrupt,
        {
          item: entry.item,
          reason: interrupted,
          interruptedAt: Date.now(),
        },
      )
    }
    else {
      emit(
        listeners.end,
        {
          item: entry.item,
          endedAt: Date.now(),
        },
      )
    }

    if (options?.allowStartWaiting !== false) {
      tryStartWaiting()
    }
  }

  function start(item: PlaybackItem<TAudio>) {
    const entry: ActivePlayback<TAudio>
      = {
        item,
        controller: new AbortController(),
        startedAt: Date.now(),
      }

    active.set(item.id, entry)

    emit(
      listeners.start,
      {
        item,
        startedAt: entry.startedAt,
      },
    )

    void options
      .play(
        item,
        entry.controller.signal,
      )
      .then(() => {
        finalize(entry)
      })
      .catch((err) => {
        if (entry.controller.signal.aborted) {
          return
        }

        finalize(
          entry,
          errorMessageFrom(err) ?? 'playback-error',
        )
      })
  }

  function enqueue(item: PlaybackItem<TAudio>) {
    const queued: WaitingPlayback<TAudio>
      = {
        item,
        enqueuedAt: Date.now(),
      }

    let index = waiting.findIndex(x => x.item.priority < item.priority)
    if (index === -1)
      index = waiting.length
    waiting.splice(index, 0, queued)
  }

  function resolvePolicy(blocked: 'overflow' | 'owner-overflow') {
    return blocked === 'owner-overflow'
      ? ownerOverflowPolicy
      : overflowPolicy
  }

  function handleBlocked(item: PlaybackItem<TAudio>, blocked: 'overflow' | 'owner-overflow') {
    const policy = resolvePolicy(blocked)
    switch (policy) {
      case 'queue':
        enqueue(item)
        return
      case 'reject':
        reject(item, blocked)
        return
      case 'steal-oldest':
        stealOldest(item, blocked)
        return
      case 'steal-lowest-priority':
        stealLowestPriority(item)
    }
  }

  function tryStartWaiting() {
    let i = 0

    while (i < waiting.length && active.size < maxVoices) {
      const next = waiting[i]
      const blocked = canStart(next.item)

      if (!blocked) {
        waiting.splice(i, 1)
        start(next.item)

        continue
      }

      const policy = resolvePolicy(blocked)
      if (policy === 'queue') {
        i++
        continue
      }

      waiting.splice(i, 1)

      switch (policy) {
        case 'reject':
          reject(next.item, blocked)
          break
        case 'steal-oldest':
          stealOldest(next.item, blocked)
          break
        case 'steal-lowest-priority':
          stealLowestPriority(next.item)
          break
      }
    }
  }

  function interrupt(entry: ActivePlayback<TAudio>, reason: string, options?: { allowStartWaiting?: boolean }) {
    if (!active.has(entry.item.id)) {
      return
    }

    entry.controller.abort(reason)
    finalize(entry, reason, options)
  }

  function reject(item: PlaybackItem<TAudio>, reason: string) {
    emit(
      listeners.reject,
      {
        item,
        reason,
        rejectedAt:
          Date.now(),
      },
    )
  }

  function stealOldest(
    item: PlaybackItem<TAudio>,
    blocked:
      | 'overflow'
      | 'owner-overflow',
  ) {
    const victim = pickVictim(
      blocked === 'owner-overflow'
        ? x => x.item.ownerId === item.ownerId
        : undefined,

      (a, b) => a.startedAt < b.startedAt,
    )

    if (!victim) {
      enqueue(item)
      return
    }

    interrupt(victim, 'overflow', { allowStartWaiting: false })

    const recheck = canStart(item)
    if (!recheck) {
      start(item)
      return
    }

    handleBlocked(item, recheck)
  }

  function stealLowestPriority(item: PlaybackItem<TAudio>) {
    const victim = pickVictim(undefined, (a, b) => a.item.priority < b.item.priority)
    const canSteal = !!victim && victim.item.priority < item.priority

    if (!canSteal) {
      reject(item, 'priority-overflow')
      return
    }

    interrupt(victim, 'priority-overflow', { allowStartWaiting: false })

    const recheck = canStart(item)
    if (!recheck) {
      start(item)
      return
    }

    handleBlocked(item, recheck)
  }

  function schedule(item: PlaybackItem<TAudio>) {
    if (exists(item.id)) {
      return
    }

    const blocked = canStart(item)
    if (!blocked) {
      start(item)
      return
    }

    handleBlocked(item, blocked)
  }

  function stopByIntent(intentId: string, reason = 'stop-by-intent') {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (waiting[i]?.item.intentId === intentId)
        waiting.splice(i, 1)
    }

    for (const entry of [...active.values()]) {
      if (entry.item.intentId === intentId)
        interrupt(entry, reason, { allowStartWaiting: false })
    }

    tryStartWaiting()
  }

  function stopByOwner(ownerId: string, reason = 'stop-by-owner') {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (waiting[i]?.item.ownerId === ownerId)
        waiting.splice(i, 1)
    }

    for (const entry of [...active.values()]) {
      if (entry.item.ownerId === ownerId)
        interrupt(entry, reason, { allowStartWaiting: false })
    }

    tryStartWaiting()
  }

  return {
    schedule,
    stopAll(reason = 'stop-all') {
      waiting.length = 0

      for (const x of [...active.values()]) {
        interrupt(x, reason, { allowStartWaiting: false })
      }
    },
    stopByIntent,
    stopByOwner,
    onStart: (
      f: Listener<PlaybackStartEvent<TAudio>>,
    ) => subscribe(listeners.start, f),
    onEnd: (
      f: Listener<PlaybackEndEvent<TAudio>>,
    ) => subscribe(listeners.end, f),
    onInterrupt: (
      f: Listener<PlaybackInterruptEvent<TAudio>>,
    ) => subscribe(listeners.interrupt, f),
    onReject: (
      f: Listener<PlaybackRejectEvent<TAudio>>,
    ) => subscribe(listeners.reject, f),
  }
}
