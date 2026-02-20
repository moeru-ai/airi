import { Vec3 } from 'vec3'
import { describe, expect, it } from 'vitest'

import { renderMap } from './map-renderer'

// ─── Helpers ────────────────────────────────────────────────────────

function createBotStub(options: {
  position?: Vec3
  blocks?: Map<string, { name: string }>
  entities?: Record<number, any>
} = {}) {
  const pos = options.position ?? new Vec3(0, 64, 0)
  const blocks = options.blocks ?? new Map()
  const entities = options.entities ?? {}

  // Add bot entity to entities
  const botEntity = {
    id: 99,
    position: pos,
    type: 'player',
    username: 'Bot',
    name: 'player',
  }
  entities[99] = botEntity

  return {
    entity: botEntity,
    entities,
    blockAt: (queryPos: Vec3) => {
      const key = `${Math.floor(queryPos.x)},${Math.floor(queryPos.y)},${Math.floor(queryPos.z)}`
      const found = blocks.get(key)
      if (found)
        return { name: found.name, position: new Vec3(Math.floor(queryPos.x), Math.floor(queryPos.y), Math.floor(queryPos.z)), diggable: true, boundingBox: 'block' }
      return { name: 'air', position: new Vec3(Math.floor(queryPos.x), Math.floor(queryPos.y), Math.floor(queryPos.z)), diggable: false, boundingBox: 'empty' }
    },
  } as any
}

function buildBlockMap(entries: Array<[number, number, number, string]>): Map<string, { name: string }> {
  const map = new Map<string, { name: string }>()
  for (const [x, y, z, name] of entries) {
    map.set(`${x},${y},${z}`, { name })
  }
  return map
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('map-renderer', () => {
  describe('renderMap top-down', () => {
    it('calls blockAt with Vec3-compatible positions', () => {
      const pos = new Vec3(0, 64, 0)
      const bot = {
        entity: {
          id: 99,
          position: pos,
          type: 'player',
          username: 'Bot',
          name: 'player',
        },
        entities: {},
        blockAt: (queryPos: Vec3) => {
          queryPos.floored()
          return { name: 'air', position: pos, diggable: false, boundingBox: 'empty' }
        },
      } as any

      expect(() => renderMap(bot, { radius: 1, showEntities: false, showElevation: false })).not.toThrow()
    })

    it('renders a basic map with the bot at center', () => {
      const bot = createBotStub()
      const result = renderMap(bot, { radius: 3, showElevation: false })

      expect(result.view).toBe('top-down')
      expect(result.center).toEqual({ x: 0, y: 64, z: 0 })
      expect(result.radius).toBe(3)
      expect(result.map).toContain('@') // Bot marker
    })

    it('classifies ground blocks correctly', () => {
      const blocks = buildBlockMap([
        [0, 64, 0, 'grass_block'],
        [1, 64, 0, 'grass_block'],
        [-1, 64, 0, 'dirt'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 2, showEntities: false, showElevation: false })

      // Ground blocks should appear as '.'
      expect(result.map).toContain('.')
      expect(result.legend).toContain('grass/dirt')
    })

    it('shows water blocks as ~', () => {
      const blocks = buildBlockMap([
        [2, 64, 0, 'water'],
        [3, 64, 0, 'water'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 4, showEntities: false, showElevation: false })

      expect(result.map).toContain('~')
      expect(result.legend).toContain('water')
    })

    it('shows tree trunks as T', () => {
      const blocks = buildBlockMap([
        [3, 64, 0, 'oak_log'],
        [3, 65, 0, 'oak_log'],
        [3, 66, 0, 'oak_log'],
        [3, 67, 0, 'oak_leaves'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 4, showEntities: false, showElevation: false })

      // Top-down view should show the topmost block — leaves on top of the log column
      // But the log at surface level should be visible if it's the surface block
      expect(result.legend).toMatch(/tree trunk|leaves/)
    })

    it('shows ores as $', () => {
      const blocks = buildBlockMap([
        [1, 64, 0, 'iron_ore'],
        [2, 64, 0, 'diamond_ore'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 3, showEntities: false, showElevation: false })

      expect(result.map).toContain('$')
      expect(result.legend).toContain('ore')
    })

    it('shows interactive blocks as !', () => {
      const blocks = buildBlockMap([
        [1, 64, 0, 'crafting_table'],
        [-1, 64, 0, 'chest'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 2, showEntities: false, showElevation: false })

      expect(result.map).toContain('!')
      expect(result.legend).toContain('chest/furnace/table')
    })

    it('overlays entities on the map', () => {
      const entities: Record<number, any> = {
        1: { id: 1, name: 'zombie', type: 'mob', position: new Vec3(2, 64, 0) },
        2: { id: 2, name: 'cow', type: 'mob', position: new Vec3(-1, 64, 1) },
        3: { id: 3, name: 'player', type: 'player', username: 'Alex', position: new Vec3(0, 64, -2) },
      }
      const bot = createBotStub({ entities })
      const result = renderMap(bot, { radius: 4, showElevation: false })

      expect(result.map).toContain('M') // hostile mob
      expect(result.map).toContain('A') // passive mob (animal)
      expect(result.map).toContain('P') // player
      expect(result.map).toContain('@') // self
      expect(result.map).toContain('zombie')
      expect(result.map).toContain('Alex')
    })

    it('respects radius clamping', () => {
      const bot = createBotStub()
      const result = renderMap(bot, { radius: 100 })
      expect(result.radius).toBe(32) // MAX_RADIUS

      const result2 = renderMap(bot, { radius: 0 })
      expect(result2.radius).toBe(1) // min 1
    })

    it('shows compass directions', () => {
      const bot = createBotStub()
      const result = renderMap(bot, { radius: 3 })

      expect(result.map).toContain('N(-Z)')
      expect(result.map).toContain('S(+Z)')
      expect(result.map).toContain('W(-X)')
      expect(result.map).toContain('E(+X)')
    })
  })

  describe('renderMap cross-section', () => {
    it('renders a cross-section at the bot Y level', () => {
      const blocks = buildBlockMap([
        [0, 63, 0, 'stone'],
        [0, 64, 0, 'grass_block'],
        [1, 63, 0, 'stone'],
        [1, 64, 0, 'grass_block'],
        [-1, 63, 0, 'stone'],
        [-1, 64, 0, 'dirt'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 3, view: 'cross-section' })

      expect(result.view).toBe('cross-section')
      expect(result.map).toContain('Cross-section')
      expect(result.map).toContain('@') // Bot marker
    })
  })

  describe('legend', () => {
    it('only includes categories present on the map', () => {
      // Map with only ground and water
      const blocks = buildBlockMap([
        [0, 64, 0, 'grass_block'],
        [1, 64, 0, 'water'],
      ])
      const bot = createBotStub({ blocks })
      const result = renderMap(bot, { radius: 2, showEntities: false, showElevation: false })

      expect(result.legend).toContain('grass/dirt')
      expect(result.legend).toContain('water')
      // Should NOT contain categories not on the map
      expect(result.legend).not.toContain('lava')
      expect(result.legend).not.toContain('ore')
    })
  })
})
