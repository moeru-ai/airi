import { describe, expect, it } from 'vitest'

import { createCatchUpFeed } from './catch-up-feed'

/** A small owner: it keeps every message as its backlog and publishes after it stores. */
function createOwner() {
  const kept: string[] = []
  const feed = createCatchUpFeed<string>({ backlog: () => kept, caughtUp: () => `caughtUp:${kept.length}` })
  const add = (message: string) => {
    kept.push(message)
    feed.publish(message)
  }
  return { feed, add }
}

describe('createCatchUpFeed', () => {
  it('delivers the backlog, then caughtUp, then live messages', () => {
    const { feed, add } = createOwner()
    add('a')
    add('b')
    const received: string[] = []

    feed.subscribe(message => received.push(message))
    add('c')

    expect(received).toEqual(['a', 'b', 'caughtUp:2', 'c'])
    expect(feed.subscribers).toBe(1)
  })

  it('holds a message published during the backlog delivery until after caughtUp', () => {
    const { feed, add } = createOwner()
    add('a')
    add('b')
    const received: string[] = []

    feed.subscribe((message) => {
      received.push(message)
      if (message === 'a')
        add('during')
    })

    expect(received).toEqual(['a', 'b', 'caughtUp:2', 'during'])
  })

  it('does not repeat a message for a subscriber added while that message is published', () => {
    const { feed, add } = createOwner()
    const late: string[] = []
    feed.subscribe((message) => {
      if (message === 'x')
        feed.subscribe(next => late.push(next))
    })

    add('x')
    add('y')

    expect(late).toEqual(['x', 'caughtUp:1', 'y'])
  })

  it('stops delivery after unsubscribe', () => {
    const { feed, add } = createOwner()
    const received: string[] = []
    const subscription = feed.subscribe(message => received.push(message))

    add('a')
    subscription.unsubscribe()
    add('b')

    expect(received).toEqual(['caughtUp:0', 'a'])
    expect(feed.subscribers).toBe(0)
  })

  it('delivers live messages of a sliding subscriber in a microtask and drops the oldest when full', async () => {
    const { feed, add } = createOwner()
    add('a')
    const received: string[] = []
    feed.subscribe(message => received.push(message), { strategy: 'sliding', capacity: 2 })

    add('b')
    add('c')
    add('d')

    expect(received).toEqual(['a', 'caughtUp:1'])
    await Promise.resolve()
    expect(received).toEqual(['a', 'caughtUp:1', 'c', 'd'])
  })

  it('drops new live messages of a full dropping subscriber', async () => {
    const { feed, add } = createOwner()
    const received: string[] = []
    feed.subscribe(message => received.push(message), { strategy: 'dropping', capacity: 2 })

    add('a')
    add('b')
    add('c')
    await Promise.resolve()
    add('d')
    await Promise.resolve()

    expect(received).toEqual(['caughtUp:0', 'a', 'b', 'd'])
  })

  it('keeps a bounded subscriber in publish order with messages held during the backlog', async () => {
    const { feed, add } = createOwner()
    add('a')
    const received: string[] = []
    feed.subscribe((message) => {
      received.push(message)
      if (message === 'a')
        add('during')
    }, { strategy: 'sliding', capacity: 4 })
    add('after')

    await Promise.resolve()

    expect(received).toEqual(['a', 'caughtUp:1', 'during', 'after'])
  })

  it('delivers nothing to a bounded subscriber after unsubscribe', async () => {
    const { feed, add } = createOwner()
    const received: string[] = []
    const subscription = feed.subscribe(message => received.push(message), { strategy: 'dropping', capacity: 4 })

    add('a')
    subscription.unsubscribe()
    await Promise.resolve()

    expect(received).toEqual(['caughtUp:0'])
  })

  it('rejects a capacity below 1', () => {
    const { feed } = createOwner()

    expect(() => feed.subscribe(() => {}, { strategy: 'sliding', capacity: 0 })).toThrow('capacity')
  })
})
