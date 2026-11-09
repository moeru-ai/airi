import { describe, expect, it } from 'vitest'

import { createQueue } from './queue'

describe('createQueue', () => {
  it('runs an item that a handler enqueues after the current item, not inside it', async () => {
    const order: string[] = []
    const queue = createQueue<string>({ handlers: [async ({ data }) => {
      order.push(`start:${data}`)
      if (data === 'first')
        queue.enqueue('second')
      order.push(`end:${data}`)
    }] })
    const drained = new Promise<void>(resolve => queue.on('drain', resolve))

    queue.enqueue('first')
    await drained

    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second'])
  })

  it('passes handler events to the listener of the matching name', async () => {
    const received: unknown[] = []
    const queue = createQueue<string>({ handlers: [async ({ data, emit }) => {
      emit('progress', data)
      emit('progress', 'done')
    }] })
    queue.onHandlerEvent('progress', (value) => {
      received.push(value)
    })
    const drained = new Promise<void>(resolve => queue.on('drain', resolve))

    queue.enqueue('first')
    await drained

    expect(received).toEqual(['first', 'done'])
  })

  it('reports the result of each handler and continues after an error', async () => {
    const events: string[] = []
    const queue = createQueue<string>({ handlers: [
      async () => {
        throw new Error('handler failed')
      },
      async () => {},
    ] })
    queue.on('error', (payload) => {
      events.push(`error:${payload}`)
    })
    queue.on('result', (payload) => {
      events.push(`result:${payload}`)
    })
    const drained = new Promise<void>(resolve => queue.on('drain', resolve))

    queue.enqueue('item')
    await drained

    expect(events).toEqual(['error:item', 'result:item'])
  })
})
