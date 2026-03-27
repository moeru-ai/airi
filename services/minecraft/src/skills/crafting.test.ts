import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionError } from '../utils/errors'
import { smeltItem } from './crafting'

const mocks = vi.hoisted(() => ({
  collectBlock: vi.fn(),
  getInventoryCounts: vi.fn(),
  getNearestBlock: vi.fn(),
  getNearestFreeSpace: vi.fn(),
  getItemId: vi.fn(),
  getItemName: vi.fn(),
  log: vi.fn(),
  placeBlock: vi.fn(),
}))

vi.mock('../utils/logger', () => ({
  useLogger: () => ({
    log: mocks.log,
    withFields: () => ({ log: mocks.log }),
  }),
}))

vi.mock('../utils/mcdata', () => ({
  McData: {
    fromBot: vi.fn(() => ({
      getItemId: mocks.getItemId,
      getItemName: mocks.getItemName,
    })),
  },
}))

vi.mock('./actions/collect-block', () => ({
  collectBlock: mocks.collectBlock,
}))

vi.mock('./blocks', () => ({
  placeBlock: mocks.placeBlock,
}))

vi.mock('./movement', () => ({
  goToNearestBlock: vi.fn(),
  goToPosition: vi.fn(),
  moveAway: vi.fn(),
}))

vi.mock('./world', () => ({
  getInventoryCounts: mocks.getInventoryCounts,
  getNearestBlock: mocks.getNearestBlock,
  getNearestFreeSpace: mocks.getNearestFreeSpace,
}))

vi.mock('./actions/ensure', () => ({
  ensureCraftingTable: vi.fn(),
}))

vi.mock('../utils/recipe-planner', () => ({
  planRecipe: vi.fn(),
}))

describe('crafting smeltItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getNearestFreeSpace.mockReturnValue({ x: 1, y: 64, z: 1 })
    mocks.getNearestBlock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        position: {
          x: 1,
          y: 64,
          z: 1,
        },
      })
    mocks.getInventoryCounts.mockReturnValue({ furnace: 1 })
    mocks.getItemId.mockReturnValue(1)
    mocks.getItemName.mockImplementation((type: number) => type === 1 ? 'raw_beef' : 'unknown')
  })

  it('preserves the real smelting error when temporary furnace cleanup fails', async () => {
    mocks.getInventoryCounts
      .mockReturnValueOnce({ furnace: 1 })
      .mockReturnValueOnce({ furnace: 1 })
    mocks.collectBlock.mockRejectedValue(new ActionError('RESOURCE_MISSING', 'cleanup failed'))

    const furnace = {
      fuelItem: vi.fn(() => null),
      inputItem: vi.fn(() => null),
    }

    const mineflayer = {
      bot: {
        entity: {
          position: {
            distanceTo: vi.fn(() => 0),
          },
        },
        inventory: {
          items: vi.fn(() => []),
        },
        lookAt: vi.fn(),
        openFurnace: vi.fn(async () => furnace),
      },
    } as any

    await expect(smeltItem(mineflayer, 'raw_beef', 2)).rejects.toMatchObject({
      code: 'RESOURCE_MISSING',
      message: 'I do not have enough raw_beef to smelt',
    })
    expect(mocks.collectBlock).toHaveBeenCalledWith(mineflayer, 'furnace', 1)
  })
})
