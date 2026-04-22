import { describe, expect, it, vi } from 'vitest'

import { createHttpServerManager } from './index'

describe('createHttpServerManager', () => {
  it('starts and stops registered servers in order', async () => {
    const startA = vi.fn(async () => {})
    const stopA = vi.fn(async () => {})
    const startB = vi.fn(async () => {})
    const stopB = vi.fn(async () => {})

    const manager = createHttpServerManager([
      { key: 'a', start: startA, stop: stopA },
      { key: 'b', start: startB, stop: stopB },
    ])

    await manager.start()
    await manager.stop()

    expect(startA).toHaveBeenCalledOnce()
    expect(startB).toHaveBeenCalledOnce()
    expect(stopB).toHaveBeenCalledOnce()
    expect(stopA).toHaveBeenCalledOnce()
  })

  it('serializes concurrent start and stop calls', async () => {
    let releaseStartA: (() => void) | undefined

    const startA = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseStartA = resolve
      })
    })
    const stopA = vi.fn(async () => {})
    const startB = vi.fn(async () => {})
    const stopB = vi.fn(async () => {})

    const manager = createHttpServerManager([
      { key: 'a', start: startA, stop: stopA },
      { key: 'b', start: startB, stop: stopB },
    ])

    const firstStart = manager.start()
    const secondStart = manager.start()
    await Promise.resolve()

    expect(startA).toHaveBeenCalledOnce()
    expect(startB).toHaveBeenCalledTimes(0)

    releaseStartA?.()
    await Promise.all([firstStart, secondStart])

    expect(startA).toHaveBeenCalledOnce()
    expect(startB).toHaveBeenCalledOnce()

    await Promise.all([manager.stop(), manager.stop()])

    expect(stopB).toHaveBeenCalledOnce()
    expect(stopA).toHaveBeenCalledOnce()
  })
})
