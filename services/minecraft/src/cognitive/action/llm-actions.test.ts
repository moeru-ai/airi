import { beforeEach, describe, expect, it, vi } from 'vitest'

import { breakBlockAt } from '../../skills/actions/world-interactions'
import { actionsList } from './llm-actions'

vi.mock('../../skills/actions/world-interactions', () => ({
  activateNearestBlock: vi.fn(),
  breakBlockAt: vi.fn(async () => true),
  placeBlock: vi.fn(),
}))

function getMineBlockAtAction() {
  const action = actionsList.find(item => item.name === 'mineBlockAt')
  if (!action)
    throw new Error('mineBlockAt action missing')
  return action
}

describe('llm-actions mineBlockAt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows expected torch when actual block is wall_torch', async () => {
    const mineBlockAtAction = getMineBlockAtAction()
    const mineflayer = {
      bot: {
        blockAt: vi.fn(() => ({ name: 'wall_torch' })),
      },
    } as any

    const perform = mineBlockAtAction.perform(mineflayer)
    const result = await perform(1, 2, 3, 'torch')

    expect(result).toContain('Mined block at (1, 2, 3)')
    expect(breakBlockAt).toHaveBeenCalledWith(mineflayer, 1, 2, 3)
  })

  it('rejects unrelated expected block types', async () => {
    const mineBlockAtAction = getMineBlockAtAction()
    const mineflayer = {
      bot: {
        blockAt: vi.fn(() => ({ name: 'oak_log' })),
      },
    } as any

    const perform = mineBlockAtAction.perform(mineflayer)
    await expect(perform(1, 2, 3, 'torch')).rejects.toThrow(/Block type mismatch/i)
    expect(breakBlockAt).not.toHaveBeenCalled()
  })
})
