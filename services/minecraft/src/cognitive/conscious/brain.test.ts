import { describe, expect, it, vi } from 'vitest'

import { Brain } from './brain'

vi.mock('../../debug', () => {
  return {
    DebugService: {
      getInstance: () => ({
        traceLLM: vi.fn(),
        log: vi.fn(),
        updateQueue: vi.fn(),
        updateBlackboard: vi.fn(),
      }),
    },
  }
})

describe('brain decide retry', () => {
  it('retries up to 2 times for recoverable errors', async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withError: vi.fn(() => logger),
    } as any

    let call = 0
    const neuri = {
      handleStateless: vi.fn(async (_messages: any, fn: any) => {
        call++
        if (call <= 2) {
          const err: any = new Error('overloaded')
          err.status = 503
          throw err
        }

        return await fn({
          messages: [],
          reroute: vi.fn(async () => ({
            choices: [{ message: { content: '{"thought":"ok","blackboard":{},"actions":[]}' } }],
            usage: {},
          })),
        })
      }),
    } as any

    const brain = new Brain({
      eventManager: {} as any,
      neuri,
      logger,
      taskExecutor: { getAvailableActions: () => [] } as any,
      reflexManager: { getContextSnapshot: () => ({}) } as any,
    })

            ; (brain as any).bot = { bot: { chat: vi.fn() } }

    const res = await (brain as any).decide('sys', 'user')
    expect(res?.thought).toBe('ok')
    expect(neuri.handleStateless).toHaveBeenCalledTimes(3)
    expect((brain as any).bot.bot.chat).not.toHaveBeenCalled()
  })

  it('does not retry auth/badarg errors; sends chat then throws', async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      withError: vi.fn(() => logger),
    } as any

    const neuri = {
      handleStateless: vi.fn(async () => {
        const err: any = new Error('unauthorized')
        err.status = 401
        throw err
      }),
    } as any

    const brain = new Brain({
      eventManager: {} as any,
      neuri,
      logger,
      taskExecutor: { getAvailableActions: () => [] } as any,
      reflexManager: { getContextSnapshot: () => ({}) } as any,
    })

    const chat = vi.fn()
            ; (brain as any).bot = { bot: { chat } }

    await expect((brain as any).decide('sys', 'user')).rejects.toThrow('unauthorized')
    expect(neuri.handleStateless).toHaveBeenCalledTimes(1)
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
