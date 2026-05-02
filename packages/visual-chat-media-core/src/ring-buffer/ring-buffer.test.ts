import { describe, expect, it } from 'vitest'

import { RingBuffer } from '.'

describe('ringBuffer', () => {
  it('should create with given capacity', () => {
    const buf = new RingBuffer<number>(5)
    expect(buf.capacity).toBe(5)
    expect(buf.size).toBe(0)
    expect(buf.isFull).toBe(false)
  })

  it('should throw on capacity < 1', () => {
    expect(() => new RingBuffer(0)).toThrow()
    expect(() => new RingBuffer(-1)).toThrow()
  })

  it('should write and read items', () => {
    const buf = new RingBuffer<number>(3)
    buf.write(1)
    buf.write(2)
    expect(buf.size).toBe(2)
    expect(buf.readLatest(2)).toEqual([1, 2])
  })

  it('should overwrite oldest when full', () => {
    const buf = new RingBuffer<number>(3)
    buf.write(1)
    buf.write(2)
    buf.write(3)
    expect(buf.isFull).toBe(true)

    buf.write(4) // overwrites 1
    expect(buf.size).toBe(3)
    expect(buf.readLatest(3)).toEqual([2, 3, 4])
  })

  it('should peek latest item', () => {
    const buf = new RingBuffer<string>(3)
    expect(buf.peek()).toBeUndefined()
    buf.write('a')
    expect(buf.peek()).toBe('a')
    buf.write('b')
    expect(buf.peek()).toBe('b')
  })

  it('should read fewer items than requested when buffer is not full', () => {
    const buf = new RingBuffer<number>(10)
    buf.write(1)
    buf.write(2)
    expect(buf.readLatest(5)).toEqual([1, 2])
  })

  it('should clear correctly', () => {
    const buf = new RingBuffer<number>(3)
    buf.write(1)
    buf.write(2)
    buf.clear()
    expect(buf.size).toBe(0)
    expect(buf.peek()).toBeUndefined()
    expect(buf.readLatest(3)).toEqual([])
  })

  it('should convert to array', () => {
    const buf = new RingBuffer<number>(3)
    buf.write(10)
    buf.write(20)
    buf.write(30)
    buf.write(40) // overwrites 10
    expect(buf.toArray()).toEqual([20, 30, 40])
  })
})
