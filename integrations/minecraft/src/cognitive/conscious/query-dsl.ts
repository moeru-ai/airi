import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'

import type { Mineflayer } from '../../libs/mineflayer'

import { inspect } from 'node:util'

import { Vec3 } from 'vec3'

import { computeNearbyPlayerGaze } from '../perception/gaze'
import { renderMap } from './map-renderer'

import * as world from '../../skills/world'

interface BlockQueryState {
  limit: number
  predicates: Array<(block: BlockRecord) => boolean>
  range: number
}

interface BlockRecord {
  diggable: boolean
  distance: number
  name: string
  pos: { x: number, y: number, z: number }
  solid: boolean
  transparent: boolean
}

interface EntityQueryState {
  limit: number
  predicates: Array<(entity: EntityRecord) => boolean>
  range: number
}

interface EntityRecord {
  distance: number
  name: string
  pos: { x: number, y: number, z: number }
  type: string
  username?: string
}

interface InventoryQueryState {
  predicates: Array<(item: InventoryRecord) => boolean>
}

interface InventoryRecord {
  count: number
  displayName?: string
  name: string
  slot: null | number
}

interface InventorySummaryRecord {
  count: number
  name: string
}

type NamePredicate = (value: string) => boolean

interface SelfQueryRecord {
  food: number
  gameMode: string
  health: number
  heldItem: null | string
  isRaining: boolean
  location: { x: number, y: number, z: number }
  pos: { x: number, y: number, z: number }
  // Aliases of `pos`. The LLM frequently guesses `self.position` / `self.location` (and the prompt
  // prose/reflex-summary historically used those words inconsistently). Exposing all three names
  // pointing at the same coords prevents "Cannot read properties of undefined (reading 'x')" crashes
  // when the model picks a name other than `pos`.
  position: { x: number, y: number, z: number }
  timeOfDay: null | number
}

class BlockQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: BlockQueryState = { limit: 200, predicates: [], range: 16 },
  ) {}

  public first(): BlockRecord | null {
    return this.list()[0] ?? null
  }

  public [inspect.custom]() {
    return this.summarize()
  }

  public isOre(): BlockQueryChain {
    return this.clone({
      predicates: [...this.state.predicates, block => isOreName(block.name)],
    })
  }

  public limit(limit: number): BlockQueryChain {
    return this.clone({ limit: clamp(Math.floor(limit), 1, 500) })
  }

  public list(): BlockRecord[] {
    const records = collectBlockRecords(this.mineflayer, this.state.range, this.state.limit)
      .filter(block => this.state.predicates.every(predicate => predicate(block)))
      .sort((a, b) => a.distance - b.distance)
    return records.slice(0, this.state.limit)
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(block => block.name))
  }

  public sortByDistance(): BlockQueryChain {
    return this
  }

  public toJSON() {
    return this.summarize()
  }

  public where(predicate: (block: BlockRecord) => boolean): BlockQueryChain {
    return this.clone({
      predicates: [...this.state.predicates, predicate],
    })
  }

  public whereName(nameOrNames: string | string[]): BlockQueryChain {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => name.toLowerCase()))
    return this.clone({
      predicates: [...this.state.predicates, block => names.has(block.name.toLowerCase())],
    })
  }

  public within(range: number): BlockQueryChain {
    return this.clone({ range: clamp(Math.floor(range), 1, 64) })
  }

  private clone(patch: Partial<BlockQueryState>): BlockQueryChain {
    return new BlockQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }

  private summarize() {
    return {
      limit: this.state.limit,
      predicates: this.state.predicates.length,
      range: this.state.range,
      type: 'BlockQueryChain',
    }
  }
}

class EntityQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: EntityQueryState = { limit: 200, predicates: [], range: 16 },
  ) {}

  public first(): EntityRecord | null {
    return this.list()[0] ?? null
  }

  public [inspect.custom]() {
    return this.summarize()
  }

  public limit(limit: number): EntityQueryChain {
    return this.clone({ limit: clamp(Math.floor(limit), 1, 500) })
  }

  public list(): EntityRecord[] {
    const records = collectEntityRecords(this.mineflayer, this.state.range)
      .filter(entity => this.state.predicates.every(predicate => predicate(entity)))
      .sort((a, b) => a.distance - b.distance)
    return records.slice(0, this.state.limit)
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(entity => entity.name))
  }

  public toJSON() {
    return this.summarize()
  }

  public whereName(nameOrNames: string | string[]): EntityQueryChain {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => name.toLowerCase()))
    return this.clone({
      // `name` already carries the username for players; also check `username` for the rare case a
      // player entity is still loading and `name` fell back to the "player" type string.
      predicates: [...this.state.predicates, entity => names.has(entity.name.toLowerCase()) || (entity.username != null && names.has(entity.username.toLowerCase()))],
    })
  }

  public whereType(typeOrTypes: string | string[]): EntityQueryChain {
    const types = new Set((Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes]).map(type => type.toLowerCase()))
    return this.clone({
      // Match the mineflayer `type` ("player"/"mob"/...) OR the species `name` ("zombie", "cow").
      // NOTICE: must check `type` explicitly now that a player's projected `name` is its username
      // (e.g. "dssadg"), so whereType("player") still matches players.
      predicates: [...this.state.predicates, entity => types.has(entity.type.toLowerCase()) || types.has(entity.name.toLowerCase())],
    })
  }

  public within(range: number): EntityQueryChain {
    return this.clone({ range: clamp(Math.floor(range), 1, 128) })
  }

  private clone(patch: Partial<EntityQueryState>): EntityQueryChain {
    return new EntityQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }

  private summarize() {
    return {
      limit: this.state.limit,
      predicates: this.state.predicates.length,
      range: this.state.range,
      type: 'EntityQueryChain',
    }
  }
}

class InventoryQueryChain {
  constructor(
    private readonly mineflayer: Mineflayer,
    private readonly state: InventoryQueryState = { predicates: [] },
  ) {}

  public count(name: string): number {
    if (!name)
      return 0
    const needle = name.toLowerCase()
    return this.list()
      .filter(item => item.name.toLowerCase() === needle)
      .reduce((sum, item) => sum + item.count, 0)
  }

  public countByName(): Record<string, number> {
    return this.list().reduce((counts, item) => {
      counts[item.name] = (counts[item.name] ?? 0) + item.count
      return counts
    }, {} as Record<string, number>)
  }

  public has(name: string, atLeast = 1): boolean {
    return this.count(name) >= Math.max(1, Math.floor(atLeast))
  }

  public [inspect.custom]() {
    return this.summarize()
  }

  public list(): InventoryRecord[] {
    return this.mineflayer.bot.inventory
      .items()
      .map((item): InventoryRecord | null => item ? toInventoryRecord(item) : null)
      .filter((item): item is InventoryRecord => item !== null)
      .filter(item => this.state.predicates.every(predicate => predicate(item)))
  }

  public names(): NameQueryChain {
    return new NameQueryChain(this.list().map(item => item.name))
  }

  public summary(): InventorySummaryRecord[] {
    const counts = this.countByName()
    return Object.entries(counts)
      .map(([name, count]) => ({ count, name }))
      .sort((a, b) => {
        if (b.count !== a.count)
          return b.count - a.count
        return a.name.localeCompare(b.name)
      })
  }

  public toJSON() {
    return this.summarize()
  }

  public whereName(nameOrNames: string | string[]): InventoryQueryChain {
    const names = new Set((Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).map(name => name.toLowerCase()))
    return this.clone({
      predicates: [...this.state.predicates, item => names.has(item.name.toLowerCase())],
    })
  }

  private clone(patch: Partial<InventoryQueryState>): InventoryQueryChain {
    return new InventoryQueryChain(this.mineflayer, {
      ...this.state,
      ...patch,
    })
  }

  private summarize() {
    return {
      predicates: this.state.predicates.length,
      type: 'InventoryQueryChain',
    }
  }
}

class NameQueryChain {
  constructor(
    private readonly values: string[],
    private readonly predicates: NamePredicate[] = [],
    private readonly dedupe = false,
  ) {}

  public list(): string[] {
    let result = this.values.filter(value => this.predicates.every(predicate => predicate(value)))
    if (this.dedupe)
      result = [...new Set(result)]
    return result
  }

  public uniq(): NameQueryChain {
    return new NameQueryChain(this.values, this.predicates, true)
  }

  public whereIncludes(fragment: string): NameQueryChain {
    const needle = fragment.toLowerCase()
    return new NameQueryChain(
      this.values,
      [...this.predicates, value => value.toLowerCase().includes(needle)],
      this.dedupe,
    )
  }
}

export function createQueryRuntime(mineflayer: Mineflayer) {
  return {
    blockAt: ({ x, y, z }: { x: number, y: number, z: number }) => {
      const block = mineflayer.bot.blockAt(new Vec3(Math.floor(x), Math.floor(y), Math.floor(z)))
      if (!block)
        return null

      const solid = block.boundingBox === 'block'
      const transparentRaw = (block as any).transparent
      return {
        diggable: Boolean(block.diggable),
        distance: distanceBetween(mineflayer.bot.entity.position, block.position),
        name: block.name,
        pos: toPos(block.position),
        solid,
        transparent: typeof transparentRaw === 'boolean' ? transparentRaw : !solid,
      } satisfies BlockRecord
    },
    blocks: () => new BlockQueryChain(mineflayer),
    craftable: () => new NameQueryChain(world.getCraftableItems(mineflayer)),
    entities: () => new EntityQueryChain(mineflayer),
    gaze: (options?: { range?: number }) => {
      return computeNearbyPlayerGaze(mineflayer.bot, {
        maxDistance: 32,
        nearbyDistance: options?.range ?? 16,
      })
    },
    inventory: () => new InventoryQueryChain(mineflayer),
    map: (options?: { radius?: number, showElevation?: boolean, showEntities?: boolean, view?: 'cross-section' | 'top-down', yLevel?: number }) => {
      return renderMap(mineflayer.bot, options)
    },
    self: () => toSelfRecord(mineflayer),
    snapshot: (range = 16) => {
      const normalizedRange = clamp(Math.floor(range), 1, 64)
      const inventory = new InventoryQueryChain(mineflayer)
      return {
        inventory: {
          counts: inventory.countByName(),
          emptySlots: typeof mineflayer.bot.inventory.emptySlotCount === 'function'
            ? mineflayer.bot.inventory.emptySlotCount()
            : Math.max(0, 36 - mineflayer.bot.inventory.items().length),
          summary: inventory.summary(),
          totalStacks: mineflayer.bot.inventory.items().length,
        },
        nearby: {
          blocks: new BlockQueryChain(mineflayer).within(normalizedRange).limit(20).list(),
          entities: new EntityQueryChain(mineflayer).within(normalizedRange).limit(20).list(),
          ores: new BlockQueryChain(mineflayer).within(normalizedRange).isOre().limit(20).list(),
        },
        self: toSelfRecord(mineflayer),
      }
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function collectBlockRecords(mineflayer: Mineflayer, range: number, limit: number): BlockRecord[] {
  const positions = mineflayer.bot.findBlocks({
    count: clamp(limit * 8, limit, 5000),
    matching: block => block !== null && block.name !== 'air',
    maxDistance: range,
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
        diggable: Boolean(block.diggable),
        distance: distanceBetween(selfPos, block.position),
        name: block.name,
        pos: toPos(block.position),
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
        distance,
        // NOTICE: for player entities mineflayer's `entity.name` is the literal type "player"; the
        // real in-game id is `username`. Expose the username as `name` so the LLM (and whereName)
        // see "dssadg", not a phantom player called "player". Mobs have no username and fall back to
        // their species name. Root cause of the bot mistaking its master for an unknown "player".
        name: (entity as Entity).username ?? entity.name ?? 'unknown',
        pos: toPos(entity.position),
        type: entity.type,
        username: (entity as Entity).username,
      }
    })
    .filter((entity): entity is EntityRecord => entity !== null)
}

function distanceBetween(a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function isOreName(name: string): boolean {
  return name.endsWith('_ore') || name === 'ancient_debris'
}

function toInventoryRecord(item: Item): InventoryRecord {
  return {
    count: item.count,
    displayName: item.displayName,
    name: item.name,
    slot: typeof item.slot === 'number' ? item.slot : null,
  }
}

function toPos(pos: { x: number, y: number, z: number }): { x: number, y: number, z: number } {
  return { x: pos.x, y: pos.y, z: pos.z }
}

function toSelfRecord(mineflayer: Mineflayer): SelfQueryRecord {
  const pos = toPos(mineflayer.bot.entity.position)
  return {
    food: mineflayer.bot.food,
    gameMode: mineflayer.bot.game?.gameMode ?? 'unknown',
    health: mineflayer.bot.health,
    heldItem: mineflayer.bot.heldItem?.name ?? null,
    isRaining: Boolean(mineflayer.bot.isRaining),
    location: pos, // alias — matches the reflex-context summary wording
    pos,
    position: pos, // alias — LLM commonly writes self.position
    timeOfDay: typeof mineflayer.bot.time?.timeOfDay === 'number' ? mineflayer.bot.time.timeOfDay : null,
  }
}
