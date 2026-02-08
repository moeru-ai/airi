import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

import type { Mineflayer } from '../../libs/mineflayer'

import { Vec3 } from 'vec3'

import { computeNearbyPlayerGaze } from '../perception/gaze'

import * as world from '../../skills/world'

interface BlockRecord {
  name: string
  pos: { x: number, y: number, z: number }
  distance: number
  diggable: boolean
  solid: boolean
  transparent: boolean
}

interface EntityRecord {
  name: string
  type: string
  username?: string
  pos: { x: number, y: number, z: number }
  distance: number
}

interface InventoryRecord {
  name: string
  count: number
  slot: number | null
  displayName?: string
}

interface InventorySummaryRecord {
  name: string
  count: number
}

interface SelfQueryRecord {
  pos: { x: number, y: number, z: number }
  health: number
  food: number
  heldItem: string | null
  gameMode: string
  isRaining: boolean
  timeOfDay: number | null
}

type NamePredicate = (value: string) => boolean

class NameQueryChain {
  constructor(
    private readonly values: string[],
    private readonly predicates: NamePredicate[] = [],
    private readonly dedupe = false,
  ) {}

  public whereIncludes(fragment: string): NameQueryChain {
    const needle = fragment.toLowerCase()
    return new NameQueryChain(
      this.values,
      [...this.predicates, value => value.toLowerCase().includes(needle)],
      this.dedupe,
    )
  }

  public uniq(): NameQueryChain {
    return new NameQueryChain(this.values, this.predicates, true)
  }

  public list(): string[] {
    let result = this.values.filter(value => this.predicates.every(predicate => predicate(value)))
    if (this.dedupe)
      result = [...new Set(result)]
    return result
  }
}

interface BlockQueryState {
  range: number
  limit: number
  predicates: Array<(block: BlockRecord) => boolean>
}

class BlockQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: BlockQueryState = { range: 16, limit: 200, predicates: [] },
  ) {}

  public within(range: number): BlockQueryChain {
    return this.clone({ range: clamp(Math.floor(range), 1, 64) })
  }

  public limit(limit: number): BlockQueryChain {
    return this.clone({ limit: clamp(Math.floor(limit), 1, 500) })
  }

  public isOre(): BlockQueryChain {
    return this.clone({
      predicates: [...this.state.predicates, block => isOreName(block.name)],
    })
  }

  public whereName(nameOrNames: string | string[]): BlockQueryChain {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => name.toLowerCase()))
    return this.clone({
      predicates: [...this.state.predicates, block => names.has(block.name.toLowerCase())],
    })
  }

  public sortByDistance(): BlockQueryChain {
    return this
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(block => block.name))
  }

  public first(): BlockRecord | null {
    return this.list()[0] ?? null
  }

  public list(): BlockRecord[] {
    const records = collectBlockRecords(this.mineflayer, this.state.range, this.state.limit)
      .filter(block => this.state.predicates.every(predicate => predicate(block)))
      .sort((a, b) => a.distance - b.distance)
    return records.slice(0, this.state.limit)
  }

  private clone(patch: Partial<BlockQueryState>): BlockQueryChain {
    return new BlockQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }
}

interface EntityQueryState {
  range: number
  limit: number
  predicates: Array<(entity: EntityRecord) => boolean>
}

class EntityQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: EntityQueryState = { range: 16, limit: 200, predicates: [] },
  ) {}

  public within(range: number): EntityQueryChain {
    return this.clone({ range: clamp(Math.floor(range), 1, 128) })
  }

  public limit(limit: number): EntityQueryChain {
    return this.clone({ limit: clamp(Math.floor(limit), 1, 500) })
  }

  public whereType(typeOrTypes: string | string[]): EntityQueryChain {
    const types = new Set((Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes]).map(type => type.toLowerCase()))
    return this.clone({
      predicates: [...this.state.predicates, entity => types.has((entity.name || entity.type).toLowerCase())],
    })
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(entity => entity.name))
  }

  public first(): EntityRecord | null {
    return this.list()[0] ?? null
  }

  public list(): EntityRecord[] {
    const records = collectEntityRecords(this.mineflayer, this.state.range)
      .filter(entity => this.state.predicates.every(predicate => predicate(entity)))
      .sort((a, b) => a.distance - b.distance)
    return records.slice(0, this.state.limit)
  }

  private clone(patch: Partial<EntityQueryState>): EntityQueryChain {
    return new EntityQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }
}

interface InventoryQueryState {
  predicates: Array<(item: InventoryRecord) => boolean>
}

class InventoryQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: InventoryQueryState = { predicates: [] },
  ) {}

  public whereName(nameOrNames: string | string[]): InventoryQueryChain {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => name.toLowerCase()))
    return this.clone({
      predicates: [...this.state.predicates, item => names.has(item.name.toLowerCase())],
    })
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(item => item.name))
  }

  public countByName(): Record<string, number> {
    return this.list().reduce((counts, item) => {
      counts[item.name] = (counts[item.name] ?? 0) + item.count
      return counts
    }, {} as Record<string, number>)
  }

  public count(name: string): number {
    const needle = name.toLowerCase()
    return this.list()
      .filter(item => item.name.toLowerCase() === needle)
      .reduce((sum, item) => sum + item.count, 0)
  }

  public has(name: string, atLeast = 1): boolean {
    return this.count(name) >= Math.max(1, Math.floor(atLeast))
  }

  public summary(): InventorySummaryRecord[] {
    const counts = this.countByName()
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count)
          return b.count - a.count
        return a.name.localeCompare(b.name)
      })
  }

  public list(): InventoryRecord[] {
    return this.mineflayer.bot.inventory
      .items()
      .map((item): InventoryRecord | null => item ? toInventoryRecord(item) : null)
      .filter((item): item is InventoryRecord => item !== null)
      .filter(item => this.state.predicates.every(predicate => predicate(item)))
  }

  private clone(patch: Partial<InventoryQueryState>): InventoryQueryChain {
    return new InventoryQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }
}

function toInventoryRecord(item: Item): InventoryRecord {
  return {
    name: item.name,
    count: item.count,
    slot: typeof item.slot === 'number' ? item.slot : null,
    displayName: item.displayName,
  }
}

function toPos(pos: { x: number, y: number, z: number }): { x: number, y: number, z: number } {
  return { x: pos.x, y: pos.y, z: pos.z }
}

function distanceBetween(a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function collectBlockRecords(mineflayer: Mineflayer, range: number, limit: number): BlockRecord[] {
  const positions = mineflayer.bot.findBlocks({
    matching: block => block !== null && block.name !== 'air',
    maxDistance: range,
    count: clamp(limit * 8, limit, 5000),
  })
  const selfPos = mineflayer.bot.entity.position

  return positions
    .map((pos) => {
      const block = mineflayer.bot.blockAt(pos)
      if (!block || block.name === 'air')
        return null

      const solid = block.boundingBox === 'block'
      const transparentRaw = (block as any).transparent
      return {
        name: block.name,
        pos: toPos(block.position),
        distance: distanceBetween(selfPos, block.position),
        diggable: Boolean(block.diggable),
        solid,
        transparent: typeof transparentRaw === 'boolean' ? transparentRaw : !solid,
      } satisfies BlockRecord
    })
    .filter((block): block is BlockRecord => block !== null)
}

function collectEntityRecords(mineflayer: Mineflayer, range: number): EntityRecord[] {
  const entities = Object.values(mineflayer.bot.entities)
  const selfPos = mineflayer.bot.entity.position
  const selfId = mineflayer.bot.entity.id

  return entities
    .map((entity): EntityRecord | null => {
      if (!entity || !entity.position || entity.id === selfId)
        return null

      const distance = distanceBetween(selfPos, entity.position)
      if (distance > range)
        return null

      return {
        name: entity.name ?? 'unknown',
        type: entity.type,
        username: (entity as Entity).username,
        pos: toPos(entity.position),
        distance,
      }
    })
    .filter((entity): entity is EntityRecord => entity !== null)
}

function isOreName(name: string): boolean {
  return name.endsWith('_ore') || name === 'ancient_debris'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toSelfRecord(mineflayer: Mineflayer): SelfQueryRecord {
  return {
    pos: toPos(mineflayer.bot.entity.position),
    health: mineflayer.bot.health,
    food: mineflayer.bot.food,
    heldItem: mineflayer.bot.heldItem?.name ?? null,
    gameMode: mineflayer.bot.game?.gameMode ?? 'unknown',
    isRaining: Boolean(mineflayer.bot.isRaining),
    timeOfDay: typeof mineflayer.bot.time?.timeOfDay === 'number' ? mineflayer.bot.time.timeOfDay : null,
  }
}

export function createQueryRuntime(mineflayer: Mineflayer) {
  return {
    self: () => toSelfRecord(mineflayer),
    snapshot: (range = 16) => {
      const normalizedRange = clamp(Math.floor(range), 1, 64)
      const inventory = new InventoryQueryChain(mineflayer)
      return {
        self: toSelfRecord(mineflayer),
        inventory: {
          counts: inventory.countByName(),
          summary: inventory.summary(),
          emptySlots: typeof mineflayer.bot.inventory.emptySlotCount === 'function'
            ? mineflayer.bot.inventory.emptySlotCount()
            : Math.max(0, 36 - mineflayer.bot.inventory.items().length),
          totalStacks: mineflayer.bot.inventory.items().length,
        },
        nearby: {
          blocks: new BlockQueryChain(mineflayer).within(normalizedRange).limit(20).list(),
          entities: new EntityQueryChain(mineflayer).within(normalizedRange).limit(20).list(),
          ores: new BlockQueryChain(mineflayer).within(normalizedRange).isOre().limit(20).list(),
        },
      }
    },
    blocks: () => new BlockQueryChain(mineflayer),
    blockAt: ({ x, y, z }: { x: number, y: number, z: number }) => {
      const block = mineflayer.bot.blockAt(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)))
      if (!block)
        return null

      const solid = block.boundingBox === 'block'
      const transparentRaw = (block as any).transparent
      return {
        name: block.name,
        pos: toPos(block.position),
        distance: distanceBetween(mineflayer.bot.entity.position, block.position),
        diggable: Boolean(block.diggable),
        solid,
        transparent: typeof transparentRaw === 'boolean' ? transparentRaw : !solid,
      } satisfies BlockRecord
    },
    entities: () => new EntityQueryChain(mineflayer),
    inventory: () => new InventoryQueryChain(mineflayer),
    craftable: () => new NameQueryChain(world.getCraftableItems(mineflayer)),
    gaze: (options?: { range?: number }) => {
      return computeNearbyPlayerGaze(mineflayer.bot, {
        maxDistance: 32,
        nearbyDistance: options?.range ?? 16,
      })
    },
  }
}
