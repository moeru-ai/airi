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
  movements: vi.fn(function MockMovements(this: { bot: unknown }, bot: unknown) {
    this.bot = bot
  }),
  patchedGoto: vi.fn(),
  log: vi.fn(),
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
      ok: true,
      reason: 'success',
      message: 'Reached the goal',
      startPos: { x: 0, y: 0, z: 0 },
      endPos: { x: 1, y: 2, z: 3 },
      distanceTraveled: 0,
      distanceToTarget: 0,
      elapsedMs: 0,
      estimatedTimeMs: 0,
      pathCost: 0,
    })
  })

  it('uses GoalFollow so navigation keeps tracking a moving player', async () => {
    const player = { position: { x: 10, y: 64, z: -4 } }
    const setMovements = vi.fn()
    const mineflayer = {
      allowCheats: false,
      bot: {
        players: {
          Alex: { entity: player },
        },
        pathfinder: {
          setMovements,
        },
      },
    } as any

    await goToPlayer(mineflayer, 'Alex', 3)

    expect(mocks.goalFollow).toHaveBeenCalledWith(player, 3)
    expect(mocks.goalNear).not.toHaveBeenCalled()
    expect(mocks.patchedGoto).toHaveBeenCalledWith(
      mineflayer.bot,
      expect.objectContaining({ kind: 'follow', entity: player, distance: 3 }),
      expect.any(Object),
    )
    expect(setMovements).toHaveBeenCalledTimes(1)
  })
})
