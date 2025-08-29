export interface HandlerContext<T> {
  data: T
  emit: (eventName: string, ...params: any[]) => void
}

export interface Events<T> {
  enqueue: Array<(payload: T, queueLength: number) => void>
  dequeue: Array<(payload: T, queueLength: number) => void>
  process: Array<(payload: T, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  error: Array<(payload: T, error: unknown, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  result: Array<<R>(payload: T, result: R, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  drain: Array<() => void>
}

export function createQueue<T>(options: {
  handlers: Array<(ctx: HandlerContext<T>) => Promise<void>>
}) {
  const queue: T[] = []
  let drainTask: Promise<any> | undefined

  const internalEventListeners: Events<T> = {
    enqueue: [],
    dequeue: [],
    process: [],
    error: [],
    result: [],
    drain: [],
  }
  const internalHandlerEventListeners: Record<string, Array<(...params: any[]) => void>> = {}

  function on<E extends keyof Events<T>>(eventName: E, listener: Events<T>[E][number]) {
    internalEventListeners[eventName].push(listener as any)
  }

  function emit<E extends keyof Events<T>>(eventName: E, ...params: Parameters<Events<T>[E][number]>) {
    const listeners = internalEventListeners[eventName] as Events<T>[E]
    listeners.forEach(listener => (listener as any)(...params))
  }

  function onHandlerEvent(eventName: string, listener: (...params: any[]) => void) {
    internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || []
    internalHandlerEventListeners[eventName].push(listener)
  }

  function emitHandlerEvent(eventName: string, ...params: any[]) {
    const listeners = internalHandlerEventListeners[eventName] || []
    listeners.forEach(listener => listener(...params))
  }

  function enqueue(payload: T) {
    queue.push(payload)
    emit('enqueue', payload, queue.length)
    if (!drainTask) {
      drainTask = drain()
    }
  }

  function clear() {
    queue.length = 0
  }

  // Internal
  // Drain the queue and call the handlers with each dequeued item
  async function drain() {
    while (queue.length > 0) {
      // The async func should never yield at here, and shift() should
      // always return an item from the queue.
      // We cannot check for `undefined` here, because there could be
      // someone using the queue to enqueue and dequeue `undefined`.
      const payload = queue.shift() as T
      emit('dequeue', payload, queue.length)
      for (const handler of options.handlers) {
        emit('process', payload, handler)
        try {
          const result = await handler({ data: payload, emit: emitHandlerEvent })
          emit('result', payload, result, handler)
        }
        catch (err) {
          // Keep `unknown` and let the event listener handle the error type
          emit('error', payload, err, handler)
          continue
        }
      }
    }
    emit('drain')
    drainTask = undefined
  }

  function length() {
    return queue.length
  }

  return {
    enqueue,
    clear,
    length,
    on,
    onHandlerEvent,
  }
}

export type UseQueueReturn<T> = ReturnType<typeof createQueue<T>>
