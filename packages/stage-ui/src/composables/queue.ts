import type { Ref } from 'vue'

import { ref } from 'vue'

export interface HandlerContext<T> {
  data: T
  itemsToBeProcessed: () => number
  emit: (eventName: string, ...params: any[]) => void
}

export interface Events<T> {
  add: Array<(payload: T) => void>
  pick: Array<(payload: T) => void>
  processing: Array<(payload: T, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  error: Array<(payload: T, error: Error, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  processed: Array<<R>(payload: T, result: R, handler: (param: HandlerContext<T>) => Promise<any>) => void>
  done: Array<(payload: T) => void>
}

export function useQueue<T>(options: {
  handlers: Array<(ctx: HandlerContext<T>) => Promise<void>>
}) {
  const queue = ref<T[]>([]) as Ref<T[]>
  const isProcessing = ref(false)
  const internalEventListeners: Events<T> = {
    add: [],
    pick: [],
    processing: [],
    error: [],
    processed: [],
    done: [],
  }
  const internalHandlerEventListeners: Record<string, Array<(...params: any[]) => void>> = {}

  function on<E extends keyof Events<T>>(eventName: E, Listener: Events<T>[E][number]) {
    internalEventListeners[eventName].push(Listener as any)
  }

  function emit<E extends keyof Events<T>>(eventName: E, ...params: Parameters<Events<T>[E][number]>) {
    const handlers = internalEventListeners[eventName] as Events<T>[E]
    handlers.forEach((handler) => {
      (handler as any)(...params)
    })
  }

  function onHandlerEvent(eventName: string, handler: (...params: any[]) => void) {
    internalHandlerEventListeners[eventName] = internalHandlerEventListeners[eventName] || []
    internalHandlerEventListeners[eventName].push(handler)
  }

  function emitHandlerEvent(eventName: string, ...params: any[]) {
    const handlers = internalHandlerEventListeners[eventName] || []
    handlers.forEach((handler) => {
      handler(...params)
    })
  }

  async function add(payload: T) {
    queue.value.push(payload)
    emit('add', payload)
  }

  function pick() {
    const payload = queue.value.shift()
    if (!payload)
      return

    emit('pick', payload)
    return payload
  }

  // Listener for item add / enqueue event
  async function addItemListener() {
    if (isProcessing.value)
      return

    const payload = pick()
    if (!payload)
      return

    isProcessing.value = true

    for (const handler of options.handlers) {
      // If there is a need to register customised listener for processing event, then this line of code should be rewritten
      // handlers as the input parameter is only designed for the add event
      emit('processing', payload, handler)
      try {
        // Use handler to deal with the newly enqueued item
        const result = await handler({ data: payload, itemsToBeProcessed: () => queue.value.length, emit: emitHandlerEvent })
        // If there is a need to register customised listener for processing event, then this line of code should be rewritten
        // handlers as the input parameter is only designed for the add event
        emit('processed', payload, result, handler)
      }
      catch (err) {
        // If there is a need to register customised listener for processing event, then this line of code should be rewritten
        // handlers as the input parameter is only designed for the add event
        emit('error', payload, err as Error, handler)
        continue
      }
    }

    isProcessing.value = false
    emit('done', payload)

    // Process next item if any
    if (queue.value.length > 0)
      addItemListener()
  }

  on('add', addItemListener)
  // Lilia: I'm not sure why do we need to register handleItem to 'done', if queue is not empty, addItemListner will continue to call addItemListner. Calling this function again when 'done' event is triggered will only lead to payload = undefined (since queue is already empty) and return
  // Maybe leave 'done' event to be registered other customised listeners would be more reasonable
  // on('done', addItemListener)

  return {
    add,
    on,
    onHandlerEvent,
    queue,
  }
}

export type UseQueueReturn<T> = ReturnType<typeof useQueue<T>>
