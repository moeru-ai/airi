import type { Vec3 } from 'vec3'

import type { EntityState, StateChange } from './types'

/**
 * Tracks the state of all known entities
 */
export class EntityStore {
  private entities: Map<string, EntityState> = new Map()
  private selfPosition: Vec3 | null = null

  /**
   * Update or create an entity's state
   * Returns list of state changes that occurred
   */
  update(id: string, partial: Partial<EntityState>): StateChange[] {
    const now = Date.now()
    const changes: StateChange[] = []
    const existing = this.entities.get(id)

    if (!existing) {
      // New entity
      const newState: EntityState = {
        id,
        type: partial.type ?? 'player',
        name: partial.name,
        position: partial.position ?? { x: 0, y: 0, z: 0 } as Vec3,
        velocity: partial.velocity ?? { x: 0, y: 0, z: 0 } as Vec3,
        yaw: partial.yaw ?? 0,
        pitch: partial.pitch ?? 0,
        isSneaking: partial.isSneaking ?? false,
        isSprinting: partial.isSprinting ?? false,
        onGround: partial.onGround ?? true,
        firstSeen: now,
        lastUpdate: now,
      }
      this.entities.set(id, newState)
      return changes
    }

    // Track changes to relevant fields
    const trackedFields: (keyof EntityState)[] = ['isSneaking', 'isSprinting', 'onGround']

    for (const field of trackedFields) {
      if (field in partial && partial[field] !== existing[field]) {
        changes.push({
          entityId: id,
          field,
          from: existing[field],
          to: partial[field],
          timestamp: now,
        })
      }
    }

    // Apply updates
    Object.assign(existing, partial, { lastUpdate: now })

    return changes
  }

  /**
   * Get entity by ID
   */
  get(id: string): EntityState | null {
    return this.entities.get(id) ?? null
  }

  /**
   * Get all player entities
   */
  getPlayers(): EntityState[] {
    return Array.from(this.entities.values()).filter(e => e.type === 'player')
  }

  /**
   * Get all entity IDs
   */
  getAllIds(): string[] {
    return Array.from(this.entities.keys())
  }

  /**
   * Remove an entity
   */
  remove(id: string): void {
    this.entities.delete(id)
  }

  /**
   * Update self (bot) position for distance calculations
   */
  updateSelfPosition(pos: Vec3): void {
    this.selfPosition = pos
  }

  /**
   * Get self position
   */
  getSelfPosition(): Vec3 | null {
    return this.selfPosition
  }

  /**
   * Calculate distance from self to entity
   */
  distanceToSelf(id: string): number | null {
    if (!this.selfPosition)
      return null
    const entity = this.entities.get(id)
    if (!entity)
      return null
    const dx = entity.position.x - this.selfPosition.x
    const dy = entity.position.y - this.selfPosition.y
    const dz = entity.position.z - this.selfPosition.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  /**
   * Clear all entities
   */
  clear(): void {
    this.entities.clear()
    this.selfPosition = null
  }
}
