import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackItem,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '../types'

export type OverflowPolicy = 'queue' | 'reject' | 'steal-oldest' | 'steal-lowest-priority'
export type OwnerOverflowPolicy = 'reject' | 'steal-oldest'

export interface PlaybackManagerOptions<TAudio> {
  play: (item: PlaybackItem<TAudio>, signal: AbortSignal) => Promise<void>
  maxVoices?: number
  maxVoicesPerOwner?: number
  overflowPolicy?: OverflowPolicy
  ownerOverflowPolicy?: OwnerOverflowPolicy
}

export function createPlaybackManager<TAudio>(options: PlaybackManagerOptions<TAudio>) {
  const maxVoices = Math.max(1, options.maxVoices ?? 1)
  const maxVoicesPerOwner = options.maxVoicesPerOwner
  const overflowPolicy = options.overflowPolicy ?? 'queue'
  const ownerOverflowPolicy = options.ownerOverflowPolicy ?? 'steal-oldest'

  const active = new Map<string, {
    item: PlaybackItem<TAudio>
    controller: AbortController
    startedAt: number
  }>()

  const waiting: Array<{ item: PlaybackItem<TAudio>, enqueuedAt: number }> = []

  const listeners = {
    start: [] as Array<(event: PlaybackStartEvent<TAudio>) => void>,
    end: [] as Array<(event: PlaybackEndEvent<TAudio>) => void>,
    interrupt: [] as Array<(event: PlaybackInterruptEvent<TAudio>) => void>,
    reject: [] as Array<(event: PlaybackRejectEvent<TAudio>) => void>,
  }

  function onStart(listener: (event: PlaybackStartEvent<TAudio>) => void) {
    listeners.start.push(listener)
  }

  function onEnd(listener: (event: PlaybackEndEvent<TAudio>) => void) {
    listeners.end.push(listener)
  }

  function onInterrupt(listener: (event: PlaybackInterruptEvent<TAudio>) => void) {
    listeners.interrupt.push(listener)
  }

  function onReject(listener: (event: PlaybackRejectEvent<TAudio>) => void) {
    listeners.reject.push(listener)
  }

  function emitStart(item: PlaybackItem<TAudio>) {
    const event = { item, startedAt: Date.now() }
    listeners.start.forEach(listener => listener(event))
  }

  function emitEnd(item: PlaybackItem<TAudio>) {
    const event = { item, endedAt: Date.now() }
    listeners.end.forEach(listener => listener(event))
  }

  function emitInterrupt(item: PlaybackItem<TAudio>, reason: string) {
    const event = { item, reason, interruptedAt: Date.now() }
    listeners.interrupt.forEach(listener => listener(event))
  }

  function emitReject(item: PlaybackItem<TAudio>, reason: string) {
    const event = { item, reason }
    listeners.reject.forEach(listener => listener(event))
  }

  function countByOwner(ownerId?: string) {
    if (!ownerId)
      return 0
    let count = 0
    for (const entry of active.values()) {
      if (entry.item.ownerId === ownerId)
        count += 1
    }
    return count
  }

  function chooseVictimByPriority() {
    let victim: { item: PlaybackItem<TAudio>, controller: AbortController, startedAt: number } | undefined
    for (const entry of active.values()) {
      if (!victim)
        victim = entry
      else if (entry.item.priority < victim.item.priority)
        victim = entry
    }
    return victim
  }

  function chooseVictimOldest(ownerId?: string) {
    let victim: { item: PlaybackItem<TAudio>, controller: AbortController, startedAt: number } | undefined
    for (const entry of active.values()) {
      if (ownerId && entry.item.ownerId !== ownerId)
        continue
      if (!victim || entry.startedAt < victim.startedAt)
        victim = entry
    }
    return victim
  }

  function stopActive(entry: { item: PlaybackItem<TAudio>, controller: AbortController }, reason: string) {
    entry.controller.abort(reason)
    active.delete(entry.item.id)
    emitInterrupt(entry.item, reason)
  }

  function canStart(item: PlaybackItem<TAudio>) {
    if (active.size >= maxVoices)
      return { ok: false, reason: 'overflow' as const }
    if (maxVoicesPerOwner && item.ownerId) {
      if (countByOwner(item.ownerId) >= maxVoicesPerOwner)
        return { ok: false, reason: 'owner-overflow' as const }
    }
    return { ok: true as const }
  }

  function start(item: PlaybackItem<TAudio>) {
    const controller = new AbortController()
    const startedAt = Date.now()
    active.set(item.id, { item, controller, startedAt })
    emitStart(item)

    void options.play(item, controller.signal)
      .then(() => {
        if (!active.has(item.id))
          return
        active.delete(item.id)
        emitEnd(item)
        void tryStartWaiting()
      })
      .catch((err) => {
        if (!active.has(item.id))
          return
        active.delete(item.id)
        emitInterrupt(item, err instanceof Error ? err.message : 'playback-error')
        void tryStartWaiting()
      })
  }

  function tryStartWaiting() {
    if (waiting.length === 0)
      return

    const candidates = waiting
      .slice()
      .sort((a, b) => (b.item.priority - a.item.priority) || (a.enqueuedAt - b.enqueuedAt))

    for (const candidate of candidates) {
      const { ok, reason } = canStart(candidate.item)
      if (!ok) {
        if (reason === 'owner-overflow' && ownerOverflowPolicy === 'steal-oldest') {
          const victim = chooseVictimOldest(candidate.item.ownerId)
          if (victim)
            stopActive(victim, 'owner-overflow')
        }
        continue
      }

      const index = waiting.indexOf(candidate)
      if (index >= 0)
        waiting.splice(index, 1)

      start(candidate.item)
      if (active.size >= maxVoices)
        break
    }
  }

  function handleOverflow(item: PlaybackItem<TAudio>, reason: 'overflow' | 'owner-overflow') {
    if (reason === 'owner-overflow') {
      if (ownerOverflowPolicy === 'reject') {
        emitReject(item, 'owner-overflow')
        return
      }

      const victim = chooseVictimOldest(item.ownerId)
      if (victim) {
        stopActive(victim, 'owner-overflow')
        waiting.push({ item, enqueuedAt: Date.now() })
        void tryStartWaiting()
        return
      }
    }

    switch (overflowPolicy) {
      case 'reject':
        emitReject(item, 'overflow')
        break
      case 'queue':
        waiting.push({ item, enqueuedAt: Date.now() })
        break
      case 'steal-oldest': {
        const victim = chooseVictimOldest()
        if (victim)
          stopActive(victim, 'steal-oldest')
        waiting.push({ item, enqueuedAt: Date.now() })
        void tryStartWaiting()
        break
      }
      case 'steal-lowest-priority': {
        const victim = chooseVictimByPriority()
        if (victim && victim.item.priority <= item.priority) {
          stopActive(victim, 'steal-lowest-priority')
          waiting.push({ item, enqueuedAt: Date.now() })
          void tryStartWaiting()
        }
        else {
          emitReject(item, 'lower-priority')
        }
        break
      }
    }
  }

  function schedule(item: PlaybackItem<TAudio>) {
    const { ok, reason } = canStart(item)
    if (ok) {
      start(item)
      return
    }

    handleOverflow(item, reason)
  }

  function stopAll(reason: string) {
    for (const entry of active.values()) {
      stopActive(entry, reason)
    }
    waiting.length = 0
  }

  function stopByIntent(intentId: string, reason: string) {
    for (const entry of active.values()) {
      if (entry.item.intentId !== intentId)
        continue
      stopActive(entry, reason)
    }

    for (let i = waiting.length - 1; i >= 0; i -= 1) {
      if (waiting[i]?.item.intentId === intentId)
        waiting.splice(i, 1)
    }
  }

  function stopByOwner(ownerId: string, reason: string) {
    for (const entry of active.values()) {
      if (entry.item.ownerId !== ownerId)
        continue
      stopActive(entry, reason)
    }

    for (let i = waiting.length - 1; i >= 0; i -= 1) {
      if (waiting[i]?.item.ownerId === ownerId)
        waiting.splice(i, 1)
    }
  }

  return {
    schedule,
    stopAll,
    stopByIntent,
    stopByOwner,
    onStart,
    onEnd,
    onInterrupt,
    onReject,
  }
}
