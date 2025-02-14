import EventEmitter from 'eventemitter3'

export interface TickContext {
  delta: number
  nextTick: () => Promise<void>
}

export interface TickEventHandlers {
  tick: (ctx: TickContext) => void
}

export type TickEvents = keyof TickEventHandlers
export type TickEventsHandler<K extends TickEvents> = TickEventHandlers[K]

// This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
export class Ticker extends EventEmitter<TickEventHandlers> {
  constructor(options?: { interval?: number }) {
    super()
    const { interval = 300 } = options ?? { interval: 300 }

    let last = Date.now()

    setTimeout(async () => {
      while (true) {
        const start = Date.now()
        const nextTickPromise = new Promise<void>((resolve) => {
          // Schedule nextTick resolution for after all callbacks complete
          setImmediate(resolve)
        })

        // Run all callbacks without awaiting them
        const callbackPromises = this.listeners('tick').map(cb => cb({
          delta: start - last,
          nextTick: () => nextTickPromise,
        }))

        // Wait for all callbacks to complete or timeout
        await Promise.race([
          Promise.all(callbackPromises),
          new Promise(resolve =>
            setTimeout(resolve, interval),
          ),
        ])

        const remaining = interval - (Date.now() - start)
        if (remaining > 0)
          await new Promise(resolve => setTimeout(resolve, remaining))

        last = start
      }
    }, interval)
  }

  on<K extends TickEvents>(event: K, cb: TickEventsHandler<K>) {
    return super.on(event, cb)
  }
}
