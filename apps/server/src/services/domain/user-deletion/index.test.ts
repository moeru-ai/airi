import type { UserDeletionHandler } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createUserDeletionService } from './index'

function makeHandler(name: string, priority: number, body?: () => Promise<void> | void): UserDeletionHandler {
  return {
    name,
    priority,
    softDelete: vi.fn(async () => {
      await body?.()
    }),
  }
}

describe('createUserDeletionService', () => {
  describe('register', () => {
    it('rejects duplicate handler names', () => {
      const service = createUserDeletionService()
      service.register(makeHandler('flux', 20))

      expect(() => service.register(makeHandler('flux', 30))).toThrow(/Duplicate user-deletion handler name: flux/)
    })

    it('keeps handlers in ascending priority regardless of registration order', async () => {
      const service = createUserDeletionService()
      const calls: string[] = []
      service.register(makeHandler('characters', 30, () => {
        calls.push('characters')
      }))
      service.register(makeHandler('stripe', 10, () => {
        calls.push('stripe')
      }))
      service.register(makeHandler('flux', 20, () => {
        calls.push('flux')
      }))

      await service.softDeleteAll({ userId: 'u1', reason: 'user-requested' })

      // @example
      //   register order: characters(30) -> stripe(10) -> flux(20)
      //   execution order: stripe(10) -> flux(20) -> characters(30)
      expect(calls).toEqual(['stripe', 'flux', 'characters'])
    })
  })

  describe('softDeleteAll', () => {
    it('passes the user id and reason to every handler', async () => {
      const service = createUserDeletionService()
      const a = makeHandler('a', 10)
      const b = makeHandler('b', 20)
      service.register(a)
      service.register(b)

      await service.softDeleteAll({ userId: 'user-xyz', reason: 'admin' })

      expect(a.softDelete).toHaveBeenCalledTimes(1)
      expect(a.softDelete).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-xyz', reason: 'admin' }))
      expect(b.softDelete).toHaveBeenCalledTimes(1)
      expect(b.softDelete).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-xyz', reason: 'admin' }))
    })

    it('aborts on first handler error and skips later handlers', async () => {
      const service = createUserDeletionService()
      const earlyOk = makeHandler('a', 10)
      const failing = makeHandler('b', 20, () => {
        throw new Error('stripe API down')
      })
      const lateNeverRuns = makeHandler('c', 30)

      service.register(earlyOk)
      service.register(failing)
      service.register(lateNeverRuns)

      await expect(service.softDeleteAll({ userId: 'u1', reason: 'user-requested' }))
        .rejects
        .toThrow('stripe API down')

      expect(earlyOk.softDelete).toHaveBeenCalledTimes(1)
      expect(failing.softDelete).toHaveBeenCalledTimes(1)
      expect(lateNeverRuns.softDelete).not.toHaveBeenCalled()
    })

    it('runs handlers serially (next starts only after previous resolves)', async () => {
      const service = createUserDeletionService()
      const order: string[] = []

      service.register({
        name: 'slow',
        priority: 10,
        softDelete: async () => {
          order.push('slow:start')
          await new Promise(r => setTimeout(r, 5))
          order.push('slow:end')
        },
      })
      service.register({
        name: 'fast',
        priority: 20,
        softDelete: async () => {
          order.push('fast:start')
          order.push('fast:end')
        },
      })

      await service.softDeleteAll({ userId: 'u1', reason: 'user-requested' })

      // @example
      //   serial execution: slow:start -> slow:end -> fast:start -> fast:end
      //   (NOT slow:start -> fast:start -> slow:end -> fast:end which would
      //   indicate parallelism)
      expect(order).toEqual(['slow:start', 'slow:end', 'fast:start', 'fast:end'])
    })

    it('runs no handlers gracefully when registry is empty', async () => {
      const service = createUserDeletionService()
      await expect(service.softDeleteAll({ userId: 'u1', reason: 'user-requested' })).resolves.toBeUndefined()
    })
  })
})
