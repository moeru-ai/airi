import { describe, expect, it, vi } from 'vitest'

import { withSessionAdvisoryLock } from '../db'

describe('withSessionAdvisoryLock', () => {
  it('acquires the lock, runs the callback, then unlocks', async () => {
    const queryLog: string[] = []
    const client = {
      query: vi.fn(async (text: string) => {
        queryLog.push(text)
        return { rows: [] }
      }),
    }
    const run = vi.fn(async () => 'ok')

    await expect(withSessionAdvisoryLock(client, 42, run)).resolves.toBe('ok')

    expect(queryLog[0]).toMatch(/pg_advisory_lock/)
    expect(run).toHaveBeenCalledOnce()
    expect(queryLog.at(-1)).toMatch(/pg_advisory_unlock/)
    expect(client.query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_lock($1)', [42])
    expect(client.query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [42])
  })

  it('still unlocks when the callback throws', async () => {
    const queryLog: string[] = []
    const client = {
      query: vi.fn(async (text: string) => {
        queryLog.push(text)
        return { rows: [] }
      }),
    }

    await expect(withSessionAdvisoryLock(client, 42, async () => {
      throw new Error('migrate failed')
    })).rejects.toThrow('migrate failed')

    expect(queryLog.some(q => /pg_advisory_lock/.test(q))).toBe(true)
    expect(queryLog.some(q => /pg_advisory_unlock/.test(q))).toBe(true)
  })
})
