import { beforeEach, describe, expect, it, vi } from 'vitest'

import { goToPlayer } from './movement'

const mocks = vi.hoisted(() => ({
  goalFollow: vi.fn(function MockGoalFollow(this: Record<string, unknown>, entity: unknown, distance: number) {
    this.kind = 'follow'
    this.entity = entity
    this.distance = distance
  }),
  goalNear: vi.fn(function MockGoalNear(this: Record<string, unknown>, x: number, y: number, z: number, distance: number) {
    this.kind = 'near'
    this.x = x
    this.y = y
    this.z = z
    this.distance = distance
  }),
  log: vi.fn(),
  movements: vi.fn(function MockMovements(this: { bot: unknown }, bot: unknown) {
    this.bot = bot
  }),
  patchedGoto: vi.fn(),
}))

vi.mock('mineflayer-pathfinder', () => ({
  default: {
    goals: {
      GoalFollow: mocks.goalFollow,
      GoalNear: mocks.goalNear,
    },
    Movements: mocks.movements,
  },
}))

vi.mock('./patched-goto', () => ({
  patchedGoto: mocks.patchedGoto,
}))

vi.mock('../utils/logger', () => ({
  useLogger: () => ({
    log: vi.fn(),
    withFields: () => ({ log: vi.fn() }),
  }),
}))

vi.mock('./base', () => ({
  log: mocks.log,
}))

vi.mock('./world', () => ({
  getNearestBlock: vi.fn(),
  getNearestEntityWhere: vi.fn(),
}))

describe('movement goToPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.patchedGoto.mockResolvedValue({
      distanceToTarget: 0,
      distanceTraveled: 0,
      elapsedMs: 0,
      endPos: { x: 1, y: 2, z: 3 },
      estimatedTimeMs: 0,
      message: 'Reached the goal',
      ok: true,
      pathCost: 0,
      reason: 'success',
      startPos: { x: 0, y: 0, z: 0 },
    })
  })

  it('uses GoalFollow so navigation keeps tracking a moving player', async () => {
    const player = { position: { x: 10, y: 64, z: -4 } }
    const setMovements = vi.fn()
    const mineflayer = {
      allowCheats: false,
      bot: {
        pathfinder: {
          setMovements,
        },
        players: {
          Alex: { entity: player },
        },
      },
    } as any

    await goToPlayer(mineflayer, 'Alex', 3)

    expect(mocks.goalFollow).toHaveBeenCalledWith(player, 3)
    expect(mocks.goalNear).not.toHaveBeenCalled()
    expect(mocks.patchedGoto).toHaveBeenCalledWith(
      mineflayer.bot,
      expect.objectContaining({ distance: 3, entity: player, kind: 'follow' }),
      expect.any(Object),
    )
    expect(setMovements).toHaveBeenCalledTimes(1)
  })
})
