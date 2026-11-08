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
})
