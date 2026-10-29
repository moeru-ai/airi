/**
 * How a subscriber receives live messages.
 *
 * - `unbounded`: `publish` calls the listener at once. A slow listener slows the publisher.
 * - `sliding`: a queue of `capacity` messages, delivered in a microtask. A full queue drops its oldest message.
 * - `dropping`: a queue of `capacity` messages, delivered in a microtask. A full queue drops the new message.
 */
export type DeliveryStrategy = 'unbounded' | 'sliding' | 'dropping'

export interface SubscribeOptions {
  /** @default 'unbounded' */
  readonly strategy?: DeliveryStrategy
  /** The queue size of `sliding` and `dropping`. @default 256 */
  readonly capacity?: number
}

export interface CatchUpFeedOptions<M> {
  /** The messages that a new subscriber receives first, for example the kept buffer. Read once per subscribe. */
  readonly backlog: () => Iterable<M>
  /** A message after the backlog, for example a cursor. Created when the backlog is read. */
  readonly caughtUp?: () => M
}

export interface CatchUpFeed<M> {
  /** Sends a live message. Update the state behind `backlog` before this call. */
  publish: (message: M) => void
  subscribe: (listener: (message: M) => void, options?: SubscribeOptions) => { unsubscribe: () => void }
  /** The number of active subscribers, including one that is still catching up. */
  readonly subscribers: number
}

interface Subscriber<M> {
  listener: (message: M) => void
  active: boolean
  /** Live messages that arrived while the backlog was delivered. Unbounded, because only re-entrant publishes add to it. */
  held: M[] | undefined
  deliver: (message: M) => void
}

/**
 * A live feed in which a new subscriber first receives the backlog, then `caughtUp`, then the live messages.
 *
 * Guarantee: no message is lost or repeated between the backlog and the live messages, if the owner updates the
 * state behind `backlog` before each `publish`. `subscribe` copies the backlog first. A `publish` during the backlog
 * delivery, for example from a listener, waits and goes to the new subscriber after `caughtUp`. A subscriber added
 * during a `publish` does not receive that message live, because its backlog already has it.
 *
 * The backlog and `caughtUp` always arrive synchronously inside `subscribe`. The strategy applies to live messages.
 *
 * @example
 * const feed = createCatchUpFeed<Message>({ backlog: () => buffer.values(), caughtUp: () => ({ kind: 'caughtUp' }) })
 * buffer.push(record)
 * feed.publish({ kind: 'record', record })
 */
export function createCatchUpFeed<M>(options: CatchUpFeedOptions<M>): CatchUpFeed<M> {
  const subscribers = new Set<Subscriber<M>>()

  function publish(message: M) {
    // Iterate a copy, so that a subscriber added by a listener during this call does not receive the message twice.
    for (const subscriber of [...subscribers]) {
      if (!subscriber.active)
        continue
      if (subscriber.held)
        subscriber.held.push(message)
      else
        subscriber.deliver(message)
    }
  }

  function subscribe(listener: (message: M) => void, subscribeOptions: SubscribeOptions = {}) {
    const strategy = subscribeOptions.strategy ?? 'unbounded'
    const subscriber: Subscriber<M> = { listener, active: true, held: [], deliver: listener }
    if (strategy !== 'unbounded')
      subscriber.deliver = createBoundedDelivery(subscriber, strategy, subscribeOptions.capacity ?? 256)

    const backlog = [...options.backlog()]
    if (options.caughtUp)
      backlog.push(options.caughtUp())
    subscribers.add(subscriber)

    const unsubscribe = () => {
      subscriber.active = false
      subscriber.held = undefined
      subscribers.delete(subscriber)
    }

    // The caller has no handle to unsubscribe before `subscribe` returns, so the catch-up always completes. If a
    // listener throws during it, the subscriber goes away before the error reaches the caller, so it cannot throw on
    // later publishes.
    try {
      for (const message of backlog)
        listener(message)

      // Messages published during the catch-up go out in publish order. A publish inside this loop appends to `held`.
      const held = subscriber.held!
      for (let index = 0; index < held.length; index++)
        subscriber.deliver(held[index]!)
      subscriber.held = undefined
    }
    catch (error) {
      unsubscribe()
      throw error
    }

    return { unsubscribe }
  }

  return {
    publish,
    subscribe,
    get subscribers() {
      return subscribers.size
    },
  }
}

function createBoundedDelivery<M>(subscriber: Subscriber<M>, strategy: 'sliding' | 'dropping', capacity: number): (message: M) => void {
  if (!Number.isInteger(capacity) || capacity < 1)
    throw new Error('capacity must be a positive integer')

  const queue: M[] = []
  let scheduled = false

  function drain() {
    scheduled = false
    // A message that a listener publishes during this drain joins the queue and goes out in this drain too.
    while (subscriber.active && queue.length > 0) {
      const message = queue.shift()!
      try {
        subscriber.listener(message)
      }
      catch (error) {
        // Keep the remaining messages flowing, and report the error like an uncaught listener error.
        if (queue.length > 0)
          schedule()
        throw error
      }
    }
    queue.length = 0
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true
      queueMicrotask(drain)
    }
  }

  return (message) => {
    if (queue.length >= capacity) {
      if (strategy === 'dropping')
        return
      queue.shift()
    }
    queue.push(message)
    schedule()
  }
}
