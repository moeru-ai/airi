import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    withFields: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as any
  logger.withError.mockReturnValue(logger)
  // reconcileAutoFollow chains `logger.withFields({...}).log(...)`; return a chainable stub.
  logger.withFields.mockReturnValue(logger)
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

describe('reflexRuntime async behavior slot locking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Regression: https://github.com/moeru-ai/airi/pull/1915#discussion_r3340685371
  //
  // ROOT CAUSE:
  //
  // An async behavior only locked its slot for `Math.max(deltaMs, 50)` ms. A long survival
  // action (e.g. the ~1.5s auto-eat equip+consume) outlived that window, so the next tick
  // re-selected and a lower-priority reflex could start while the first promise was still
  // running — and re-equipping for that reflex cancels `bot.consume()`, dropping the bite.
  //
  // We fixed this by locking the slot until the promise settles (released via `.finally`,
  // bounded only by a deadlock cap), so nothing can preempt a running async reflex.
  it('does not let another behavior preempt a still-running async behavior (Issue #1915)', async () => {
    const runtime = new ReflexRuntime({ logger: createLogger() })
    const { bot } = createMockBot()

    let resolveSlow: () => void = () => {}
    const slowRun = vi.fn(() => new Promise<void>((resolve) => {
      resolveSlow = resolve
    }))
    const preemptorRun = vi.fn()

    runtime.registerBehavior({
      id: 'slow-survival',
      modes: ['idle', 'social', 'work', 'wander', 'alert'],
      cooldownMs: 3000,
      when: () => true,
      score: () => 1000,
      run: slowRun,
    })
    runtime.registerBehavior({
      id: 'preemptor',
      modes: ['idle', 'social', 'work', 'wander', 'alert'],
      when: () => true,
      score: () => 500,
      run: preemptorRun,
    })

    runtime.setActiveBot(bot)

    // Tick 1: the high-priority async behavior starts and holds the slot.
    expect(runtime.tick(bot, 0)).toBe('slow-survival')
    expect(slowRun).toHaveBeenCalledTimes(1)
    expect(preemptorRun).not.toHaveBeenCalled()

    // Advance past the old 50ms window while the promise is still pending.
    vi.advanceTimersByTime(100)

    // Tick 2: slot must stay locked — the lower-priority behavior must NOT preempt.
    expect(runtime.tick(bot, 0)).toBeNull()
    expect(preemptorRun).not.toHaveBeenCalled()
    expect(runtime.getActiveBehaviorId()).toBe('slow-survival')

    // The async behavior finishes; its `.finally` releases the slot.
    resolveSlow()
    await Promise.resolve()
    await Promise.resolve()

    // Tick 3: with the survival action done, the next behavior may run.
    vi.advanceTimersByTime(100)
    runtime.tick(bot, 0)
    expect(preemptorRun).toHaveBeenCalledTimes(1)
  })
})
