import { describe, expect, it, vi } from 'vitest'

import { RetentionBuffer } from './retention-buffer'

interface Item {
  id: number
  at: number
  bytes: number
}

function createBuffer(options: { maxBytes?: number, maxAgeMs?: number, onEvict?: (items: Item[]) => void }) {
  return new RetentionBuffer<Item>({ ...options, sizeOf: item => item.bytes, ageOf: item => item.at })
}

describe('retentionBuffer', () => {
  it('drops the oldest items over the byte limit at push', () => {
    const onEvict = vi.fn()
    const buffer = createBuffer({ maxBytes: 10, onEvict })

    buffer.push({ id: 1, at: 0, bytes: 4 })
    buffer.push({ id: 2, at: 1, bytes: 4 })
    buffer.push({ id: 3, at: 2, bytes: 4 })

    expect([...buffer.values()].map(item => item.id)).toEqual([2, 3])
    expect(buffer.size).toBe(2)
    expect(buffer.bytes).toBe(8)
    expect(onEvict).toHaveBeenCalledExactlyOnceWith([{ id: 1, at: 0, bytes: 4 }])
  })

  it('drops an item that is larger than the byte limit by itself', () => {
    const buffer = createBuffer({ maxBytes: 10 })

    buffer.push({ id: 1, at: 0, bytes: 11 })

    expect(buffer.size).toBe(0)
    expect(buffer.bytes).toBe(0)
  })

  it('drops the items older than the age limit at evict', () => {
    const onEvict = vi.fn()
    const buffer = createBuffer({ maxAgeMs: 100, onEvict })
    buffer.push({ id: 1, at: 0, bytes: 1 })
    buffer.push({ id: 2, at: 50, bytes: 1 })
    buffer.push({ id: 3, at: 120, bytes: 1 })

    const dropped = buffer.evict(150)

    expect(dropped.map(item => item.id)).toEqual([1])
    expect(onEvict).toHaveBeenCalledExactlyOnceWith(dropped)
    expect([...buffer.values()].map(item => item.id)).toEqual([2, 3])
    expect(buffer.evict(150)).toEqual([])
    expect(onEvict).toHaveBeenCalledOnce()
  })

  it('keeps insertion order and totals across many evictions', () => {
    const buffer = createBuffer({ maxBytes: 100 })
    for (let id = 0; id < 5000; id++)
      buffer.push({ id, at: id, bytes: 1 })

    const ids = [...buffer.values()].map(item => item.id)
    expect(ids).toHaveLength(100)
    expect(ids[0]).toBe(4900)
    expect(ids.at(-1)).toBe(4999)
    expect(buffer.bytes).toBe(100)
  })

  it('clears without calling onEvict', () => {
    const onEvict = vi.fn()
    const buffer = createBuffer({ maxBytes: 10, onEvict })
    buffer.push({ id: 1, at: 0, bytes: 4 })

    buffer.clear()

    expect(buffer.size).toBe(0)
    expect(buffer.bytes).toBe(0)
    expect(onEvict).not.toHaveBeenCalled()
  })
})
