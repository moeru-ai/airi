import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReflexRuntime } from './runtime'

const mocks = vi.hoisted(() => ({
  goalFollow: vi.fn(function MockGoalFollow(this: Record<string, unknown>, entity: unknown, distance: number) {
    this.kind = 'follow'
    this.entity = entity
    this.distance = distance
  }),
  movements: vi.fn(function MockMovements(this: { bot: unknown }, bot: unknown) {
    this.bot = bot
  }),
}))

vi.mock('mineflayer-pathfinder', () => ({
  default: {
    goals: {
      GoalFollow: mocks.goalFollow,
    },
    Movements: mocks.movements,
  },
}))

function createLogger() {
  const logger = {
    withError: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as any
  logger.withError.mockReturnValue(logger)
  return logger
}

function createMockBot() {
  const setMovements = vi.fn()
  const setGoal = vi.fn()
  const stop = vi.fn()
  const selfPosition = {
    distanceTo: vi.fn(() => 4),
  }

  const bot = {
    bot: {
      username: 'AiriBot',
      entity: { position: selfPosition },
      health: 20,
      food: 20,
      heldItem: null,
      time: { timeOfDay: 1000 },
      isRaining: false,
      players: {} as Record<string, { entity?: any }>,
      pathfinder: {
        setMovements,
        setGoal,
        stop,
      },
    },
  } as any

  return {
    bot,
    setGoal,
    stop,
  }
}

describe('reflexRuntime auto-follow visibility reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts follow when target appears after being initially invisible', () => {
    const runtime = new ReflexRuntime({
      logger: createLogger(),
    })
    const { bot, setGoal } = createMockBot()

    runtime.setActiveBot(bot)
    runtime.setAutoFollowTarget('Alex', 3)
    runtime.tick(bot, 0)

    expect(setGoal).not.toHaveBeenCalled()
    expect(runtime.getContext().getSnapshot().autonomy).toMatchObject({
      followActive: false,
      followLastError: 'Player [Alex] is not currently visible',
    })

    const targetEntity = {
      id: 42,
      position: { x: 8, y: 64, z: 5 },
      heldItem: null,
    }
    bot.bot.players.Alex = { entity: targetEntity }

    runtime.tick(bot, 0)

    expect(mocks.goalFollow).toHaveBeenCalledWith(targetEntity, 3)
    expect(setGoal).toHaveBeenCalledTimes(1)
    expect(runtime.getContext().getSnapshot().autonomy).toMatchObject({
      followActive: true,
      followLastError: null,
    })
  })

  it('stops follow when target becomes invisible after follow is active', () => {
    const runtime = new ReflexRuntime({
      logger: createLogger(),
    })
    const { bot, stop } = createMockBot()

    bot.bot.players.Alex = {
      entity: {
        id: 99,
        position: { x: 3, y: 64, z: 2 },
        heldItem: null,
      },
    }

    runtime.setActiveBot(bot)
    runtime.setAutoFollowTarget('Alex', 2)
    runtime.tick(bot, 0)

    expect(runtime.getContext().getSnapshot().autonomy).toMatchObject({
      followActive: true,
      followLastError: null,
    })

    delete bot.bot.players.Alex
    runtime.tick(bot, 0)

    expect(stop).toHaveBeenCalled()
    expect(runtime.getContext().getSnapshot().autonomy).toMatchObject({
      followActive: false,
      followLastError: 'Player [Alex] is not currently visible',
    })
  })
})
