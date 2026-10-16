import { describe, expect, it, vi } from 'vitest'

import { createLatest } from './latest'

describe('createLatest', () => {
  it('aborts the active run when a newer key arrives, and keeps it for a repeated key', async () => {
    const signals = new Map<string, AbortSignal>()
    const releases = new Map<string, () => void>()
    const runner = createLatest<{ text: string, revision: number }>(async (value, signal) => {
      signals.set(`${value.text}:${value.revision}`, signal)
      await new Promise<void>(resolve => releases.set(value.text, resolve))
    }, { key: value => value.text })

    runner.push({ text: 'hello', revision: 1 })
    runner.push({ text: 'hello', revision: 2 })
    runner.push({ text: 'hello world', revision: 3 })

    expect([...signals.keys()]).toEqual(['hello:1', 'hello world:3'])
    expect(signals.get('hello:1')?.aborted).toBe(true)
    expect(signals.get('hello world:3')?.aborted).toBe(false)
    releases.get('hello world')?.()
    await runner.idle()
  })

  it('waits for a quiet period before it runs', async () => {
    vi.useFakeTimers()
    try {
      const run = vi.fn()
      const runner = createLatest<string>(run, { debounceMs: 100 })
      runner.push('a')
      await vi.advanceTimersByTimeAsync(60)
      runner.push('ab')
      await vi.advanceTimersByTimeAsync(60)

      expect(run).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(40)
      expect(run).toHaveBeenCalledOnce()
      expect(run).toHaveBeenCalledWith('ab', expect.any(AbortSignal))
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('reports errors of current runs only', async () => {
    const onError = vi.fn()
    const runner = createLatest<string>(async (value, signal) => {
      await Promise.resolve()
      if (value === 'old')
        signal.throwIfAborted()
      throw new Error(`Failed ${value}`)
    }, { onError })
    runner.push('old')
    runner.push('new')
    await runner.idle()

    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed new' }))
  })

  it('aborts its run and ignores new input after close', async () => {
    let seen: AbortSignal | undefined
    const run = vi.fn(async (_value: string, signal: AbortSignal) => {
      seen = signal
      await new Promise(() => {})
    })
    const runner = createLatest<string>(run)
    runner.push('first')
    runner.close('Input closed')
    runner.push('second')
    await runner.idle()

    expect(seen?.aborted).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })

  it('drops a waiting input on cancelPending and keeps the active run', async () => {
    vi.useFakeTimers()
    try {
      const signals: AbortSignal[] = []
      const run = vi.fn(async (_value: string, signal: AbortSignal) => {
        signals.push(signal)
      })
      const runner = createLatest<string>(run, { debounceMs: 100 })
      runner.push('waiting')
      runner.cancelPending()
      await vi.advanceTimersByTimeAsync(200)

      expect(run).not.toHaveBeenCalled()
      await runner.idle()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
