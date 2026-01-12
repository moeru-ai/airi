import type { Vec3 } from 'vec3'

import type { Belief, EntityState, PatternDefinition, StateChange } from '../world/types'

/**
 * Computes beliefs about entity behaviors based on registered patterns
 */
export class BeliefEngine {
  private patterns: Map<string, PatternDefinition> = new Map()

  /**
   * Register a pattern
   */
  register(pattern: PatternDefinition): void {
    this.patterns.set(pattern.id, pattern)
  }

  /**
   * Unregister a pattern
   */
  unregister(id: string): void {
    this.patterns.delete(id)
  }

  /**
   * Get all registered pattern IDs
   */
  getPatternIds(): string[] {
    return Array.from(this.patterns.keys())
  }

  /**
   * Compute all beliefs for an entity
   */
  computeBeliefs(
    entityId: string,
    getState: (id: string) => EntityState | null,
    getHistory: (id: string, since: number) => StateChange[],
    selfPosition: Vec3 | null,
  ): Record<string, Belief> {
    const beliefs: Record<string, Belief> = {}

    for (const [id, pattern] of this.patterns) {
      try {
        beliefs[id] = pattern.compute(entityId, getState, getHistory, selfPosition)
      }
      catch {
        // Pattern threw an error, treat as no belief
        beliefs[id] = { confidence: 0 }
      }
    }

    return beliefs
  }

  /**
   * Compute a single belief for an entity
   */
  computeBelief(
    patternId: string,
    entityId: string,
    getState: (id: string) => EntityState | null,
    getHistory: (id: string, since: number) => StateChange[],
    selfPosition: Vec3 | null,
  ): Belief | null {
    const pattern = this.patterns.get(patternId)
    if (!pattern)
      return null

    try {
      return pattern.compute(entityId, getState, getHistory, selfPosition)
    }
    catch {
      return { confidence: 0 }
    }
  }
}
