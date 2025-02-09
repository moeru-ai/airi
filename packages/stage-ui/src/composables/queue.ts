import type { Ref } from 'vue'

import { ref } from 'vue'

export interface HandlerContext<T> {
  data: T
  itemsToBeProcessed: () => number
  emit: (eventName: string, ...params: any[]) => void
}

// FIXME: should be exported?
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
  const internalEventHandler: Events<T> = {
    add: [],
    pick: [],
    processing: [],
    error: [],
    processed: [],
    done: [],
  }
  const internalHandlerEventHandler: Record<string, Array<(...params: any[]) => void>> = {}

  function on<E extends keyof Events<T>>(eventName: E, handler: Events<T>[E][number]) {
    internalEventHandler[eventName].push(handler as any)
  }

  function emit<E extends keyof Events<T>>(eventName: E, ...params: Parameters<Events<T>[E][number]>) {
    const handlers = internalEventHandler[eventName] as Events<T>[E]
    handlers.forEach((handler) => {
      (handler as any)(...params)
    })
  }

  function onHandlerEvent(eventName: string, handler: (...params: any[]) => void) {
    internalHandlerEventHandler[eventName] = internalHandlerEventHandler[eventName] || []
    internalHandlerEventHandler[eventName].push(handler)
  }

  function emitHandlerEvent(eventName: string, ...params: any[]) {
    const handlers = internalHandlerEventHandler[eventName] || []
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

  async function handleItem() {
    if (isProcessing.value)
      return

    const payload = pick()
    if (!payload)
      return

    isProcessing.value = true

    for (const handler of options.handlers) {
      emit('processing', payload, handler)
      try {
        const result = await handler({ data: payload, itemsToBeProcessed: () => queue.value.length, emit: emitHandlerEvent })
        emit('processed', payload, result, handler)
      }
      catch (err) {
        emit('error', payload, err as Error, handler)
        continue
      }
    }

    isProcessing.value = false
    emit('done', payload)

    // Process next item if any
    if (queue.value.length > 0)
      handleItem()
  }

  on('add', handleItem)
  on('done', handleItem)

  return {
    add,
    on,
    onHandlerEvent,
    queue,
  }
}

export type UseQueueReturn<T> = ReturnType<typeof useQueue<T>>
