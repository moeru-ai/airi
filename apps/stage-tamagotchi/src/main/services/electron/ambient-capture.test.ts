import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AmbientCapture } from './ambient-capture'

const children: FakeChild[] = []
class FakeChild extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => true)
}
vi.mock('node:child_process', () => ({ spawn: () => {
  const child = new FakeChild()
  children.push(child)
  return child
} }))

function packet(kind: number, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(5 + payload.length)
  result[0] = kind
  result.writeUInt32LE(payload.length, 1)
  payload.copy(result, 5)
  return result
}
const captures: AmbientCapture[] = []
function start() {
  const capture = new AmbientCapture('capture-helper', { displayId: 1, width: 2, height: 1, frameRate: 20 }, 7)
  captures.push(capture)
  const child = children.at(-1)!
  child.stdout.write(packet(0))
  return { capture, child }
}
afterEach(() => {
  captures.splice(0).forEach(capture => capture.stop())
  vi.useRealTimers()
})

describe('native ambient capture', () => {
  it('assembles split packets and owns returned bytes after the next read', async () => {
    const { capture, child } = start()
    const reading = capture.read()
    await Promise.resolve()
    const bytes = packet(1, Buffer.from([1, 2, 3, 255, 4, 5, 6, 255]))
    child.stdout.write(bytes.subarray(0, 2))
    child.stdout.write(bytes.subarray(2, 7))
    child.stdout.write(bytes.subarray(7))
    const first = await reading
    expect(first?.data).toEqual(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]))
    const next = capture.read()
    await Promise.resolve()
    child.stdout.write(packet(3))
    expect(await next).toBeNull()
    expect(first?.data[0]).toBe(1)
  })

  it('rejects outstanding work when the owner stops', async () => {
    const { capture, child } = start()
    const reading = capture.read()
    await Promise.resolve()
    capture.stop()
    await expect(reading).rejects.toThrow('stopped')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('rejects a read when the helper closes its input pipe', async () => {
    const { capture, child } = start()
    const reading = capture.read()
    await Promise.resolve()
    child.stdin.emit('error', new Error('EPIPE'))
    await expect(reading).rejects.toThrow('EPIPE')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('rejects oversized packets without growing the receive buffer', async () => {
    const { capture, child } = start()
    const reading = capture.read()
    await Promise.resolve()
    const header = packet(1)
    header.writeUInt32LE(0xFFFFFFFF, 1)
    child.stdout.write(header)
    await expect(reading).rejects.toThrow('packet length')
    expect(child.kill).toHaveBeenCalledOnce()
  })

  it('bounds a stalled frame request and forbids overlapping reads', async () => {
    vi.useFakeTimers()
    const { capture } = start()
    const reading = capture.read()
    await Promise.resolve()
    await expect(capture.read()).rejects.toThrow('already pending')
    const rejected = expect(reading).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(5000)
    await rejected
  })
})
