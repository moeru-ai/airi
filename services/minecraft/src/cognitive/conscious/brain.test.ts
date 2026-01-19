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
  it('retries up to 3 total attempts for recoverable errors then aborts', async () => {
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
        if (call <= 3) {
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
      eventBus: { subscribe: vi.fn() } as any,
      neuri,
      logger,
      taskExecutor: { getAvailableActions: () => [] } as any,
      reflexManager: { getContextSnapshot: () => ({}) } as any,
    })

      ; (brain as any).bot = { bot: { chat: vi.fn() } }

    const res = await (brain as any).decide('sys', 'user')
    expect(res).toBeNull()
    expect(neuri.handleStateless).toHaveBeenCalledTimes(3)
    expect((brain as any).bot.bot.chat).toHaveBeenCalledTimes(1)
  })

  it('does not retry auth/badarg errors; sends chat then aborts', async () => {
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
      eventBus: { subscribe: vi.fn() } as any,
      neuri,
      logger,
      taskExecutor: { getAvailableActions: () => [] } as any,
      reflexManager: { getContextSnapshot: () => ({}) } as any,
    })

    const chat = vi.fn()
      ; (brain as any).bot = { bot: { chat } }

    const res = await (brain as any).decide('sys', 'user')
    expect(res).toBeNull()
    expect(neuri.handleStateless).toHaveBeenCalledTimes(1)
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
