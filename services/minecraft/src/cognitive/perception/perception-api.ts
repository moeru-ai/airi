import type { Logg } from '@guiiai/logg'

import type { Belief, EntityState, EntityView } from '../world/types'

import { BeliefEngine } from '../semantics/belief-engine'
import { teabagPattern } from '../semantics/patterns/teabag'
import { EntityStore } from '../world/entity-store'
import { TemporalBuffer } from '../world/temporal-buffer'

/**
 * Unified perception API for upper layers
 * Provides entity queries and belief computations
 */
export class PerceptionAPI {
  private store: EntityStore
  private buffer: TemporalBuffer
  private engine: BeliefEngine

  constructor(
    private readonly deps: {
      logger: Logg
    },
  ) {
    this.deps.logger.log('PerceptionAPI: initialized')
    this.store = new EntityStore()
    this.buffer = new TemporalBuffer(5000) // 5s history
    this.engine = new BeliefEngine()

    // Register default patterns
    this.engine.register(teabagPattern)
  }

  // ============ Entity Updates (from Mineflayer) ============

  /**
   * Update an entity's state (called by perception collector)
   */
  updateEntity(id: string, partial: Partial<EntityState>): void {
    const changes = this.store.update(id, partial)
    this.buffer.recordAll(changes)
  }

  /**
   * Remove an entity
   */
  removeEntity(id: string): void {
    this.store.remove(id)
    this.buffer.clearEntity(id)
  }

  /**
   * Update self position (for distance calculations)
   */
  updateSelfPosition(x: number, y: number, z: number): void {
    this.store.updateSelfPosition({ x, y, z } as any)
  }

  // ============ Entity Queries ============

  /**
   * Get all player entities with computed beliefs
   */
  getPlayers(): EntityView[] {
    return this.store.getPlayers().map(e => this.buildEntityView(e))
  }

  /**
   * Get a specific entity by ID
   */
  getEntity(id: string): EntityView | null {
    const state = this.store.get(id)
    if (!state)
      return null
    return this.buildEntityView(state)
  }

  // ============ Belief Queries ============

  /**
   * Find entities with high confidence of a pattern
   */
  entitiesWithBelief(pattern: string, minConfidence: number = 0.5): EntityView[] {
    return this.getPlayers().filter(e => (e.beliefs[pattern]?.confidence ?? 0) >= minConfidence)
  }

  /**
   * Get the top belief for an entity
   */
  getTopBelief(entityId: string): { pattern: string, belief: Belief } | null {
    const entity = this.getEntity(entityId)
    if (!entity)
      return null

    let top: { pattern: string, belief: Belief } | null = null
    for (const [pattern, belief] of Object.entries(entity.beliefs)) {
      if (!top || belief.confidence > top.belief.confidence) {
        top = { pattern, belief }
      }
    }
    return top
  }

  // ============ Pattern Management ============

  /**
   * Register a custom pattern
   */
  registerPattern(pattern: Parameters<BeliefEngine['register']>[0]): void {
    this.engine.register(pattern)
  }

  // ============ Maintenance ============

  /**
   * Prune old history entries
   */
  prune(): void {
    this.buffer.prune()
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.store.clear()
    this.buffer.clear()
  }

  // ============ Internal ============

  private buildEntityView(state: EntityState): EntityView {
    const beliefs = this.engine.computeBeliefs(
      state.id,
      id => this.store.get(id),
      (id, since) => this.buffer.query(id, since),
      this.store.getSelfPosition(),
    )

    return {
      id: state.id,
      name: state.name ?? state.id,
      type: state.type,
      state,
      beliefs,
      distanceToSelf: this.store.distanceToSelf(state.id) ?? Infinity,
    }
  }
}
