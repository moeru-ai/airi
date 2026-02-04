import { Vec3 } from 'vec3'
import { describe, expect, it, vi } from 'vitest'

import { createQueryRuntime } from './query-dsl'

vi.mock('../../skills/world', () => ({
  getCraftableItems: vi.fn(() => ['oak_planks', 'wooden_pickaxe', 'stone_pickaxe', 'stone_pickaxe']),
}))

function createMineflayerStub() {
  const blocks = new Map<string, any>([
    ['1,64,0', { name: 'coal_ore', position: new Vec3(1, 64, 0), diggable: true, boundingBox: 'block', transparent: false }],
    ['2,64,0', { name: 'stone', position: new Vec3(2, 64, 0), diggable: true, boundingBox: 'block', transparent: false }],
    ['3,64,0', { name: 'coal_ore', position: new Vec3(3, 64, 0), diggable: true, boundingBox: 'block', transparent: false }],
    ['4,64,0', { name: 'ancient_debris', position: new Vec3(4, 64, 0), diggable: true, boundingBox: 'block', transparent: false }],
  ])

  return {
    bot: {
      entity: {
        id: 99,
        position: new Vec3(0, 64, 0),
      },
      entities: {
        1: { id: 1, name: 'zombie', type: 'mob', position: new Vec3(2, 64, 0) },
        2: { id: 2, name: 'player', type: 'player', username: 'Alex', position: new Vec3(6, 64, 0) },
        99: { id: 99, name: 'player', type: 'player', username: 'Self', position: new Vec3(0, 64, 0) },
      },
      inventory: {
        items: () => [
          { name: 'bread', count: 3, slot: 10, displayName: 'Bread' },
          { name: 'cobblestone', count: 16, slot: 12, displayName: 'Cobblestone' },
          { name: 'bread', count: 2, slot: 13, displayName: 'Bread' },
        ],
      },
      findBlocks: () => Array.from(blocks.values()).map(block => block.position),
      blockAt: (pos: Vec3) => blocks.get(`${pos.x},${pos.y},${pos.z}`) ?? null,
    },
  } as any
}

describe('query DSL', () => {
  it('supports composable ore name heuristics', () => {
    const query = createQueryRuntime(createMineflayerStub())
    const names = query.blocks().within(24).isOre().names().uniq().list()
    expect(names).toEqual(['coal_ore', 'ancient_debris'])
  })

  it('returns block snapshot at coordinate', () => {
    const query = createQueryRuntime(createMineflayerStub())
    const block = query.blockAt({ x: 2, y: 64, z: 0 })
    expect(block?.name).toBe('stone')
    expect(block?.pos).toEqual({ x: 2, y: 64, z: 0 })
  })

  it('filters entities by type and range', () => {
    const query = createQueryRuntime(createMineflayerStub())
    const zombies = query.entities().within(4).whereType('zombie').list()
    expect(zombies).toHaveLength(1)
    expect(zombies[0]?.name).toBe('zombie')
  })

  it('aggregates inventory counts', () => {
    const query = createQueryRuntime(createMineflayerStub())
    expect(query.inventory().countByName()).toEqual({
      bread: 5,
      cobblestone: 16,
    })
  })

  it('supports craftable name filters', () => {
    const query = createQueryRuntime(createMineflayerStub())
    const pickaxes = query.craftable().whereIncludes('pickaxe').uniq().list()
    expect(pickaxes).toEqual(['wooden_pickaxe', 'stone_pickaxe'])
  })
})
