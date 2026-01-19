import type { RawPerceptionEvent } from './types/raw-events'
import type { PerceptionSignal } from './types/signals'

export interface SaliencyRule<E extends RawPerceptionEvent = RawPerceptionEvent> {
  /**
   * How many occurrences within the window are required before emitting.
   */
  threshold: number
  /**
   * Optional predicate to gate the rule.
   */
  predicate?: (event: E) => boolean
  /**
   * Counter key - should be one of the predefined EVENT_KEYS
   */
  key: string
  /**
   * Builds the PerceptionSignal when the rule fires.
   */
  buildSignal: (event: E) => PerceptionSignal
}

export type SaliencyRuleBook = Partial<Record<
  RawPerceptionEvent['modality'],
  Record<string, SaliencyRule>
>>

/**
 * Fixed event keys for stable heatmap visualization.
 * All counters are initialized with these keys at startup.
 */
export const EVENT_KEYS = [
  'punch:player',
  'teabag:player',
  'move:player',
  'sound:ambient',
  'felt:damage',
  'felt:pickup',
  'system:message',
] as const

export type EventKey = typeof EVENT_KEYS[number]

/**
 * Unified window size for all event types (100 slots = ~2 seconds at 20ms/slot)
 */
export const WINDOW_SIZE = 100

/**
 * Default threshold for attention triggering
 */
export const DEFAULT_THRESHOLD = 5

export const SALIENCY_RULES: SaliencyRuleBook = {
  sighted: {
    arm_swing: {
      threshold: 5,
      key: 'punch:player',
      buildSignal: (event) => {
        const e = event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'arm_swing' }>
        return {
          type: 'entity_attention',
          description: `Player ${e.displayName || 'unknown'} is punching nearby`,
          sourceId: e.entityId,
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            kind: 'player',
            action: 'punch',
            distance: e.distance,
            hasLineOfSight: e.hasLineOfSight,
            displayName: e.displayName,
          },
        }
      },
    },
    sneak_toggle: {
      threshold: 5,
      key: 'teabag:player',
      buildSignal: (event) => {
        const e = event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'sneak_toggle' }>
        return {
          type: 'entity_attention',
          description: `Player ${e.displayName || 'unknown'} is teabagging (rapid sneaking)`,
          sourceId: e.entityId,
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            kind: 'player',
            action: 'teabag',
            distance: e.distance,
            hasLineOfSight: e.hasLineOfSight,
            displayName: e.displayName,
          },
        }
      },
    },
    entity_moved: {
      threshold: 5,
      predicate: event => (event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'entity_moved' }>).entityType === 'player',
      key: 'move:player',
      buildSignal: (event) => {
        const e = event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'entity_moved' }>
        return {
          type: 'entity_attention',
          description: `Player ${e.displayName || 'unknown'} is moving nearby`,
          sourceId: e.entityId,
          confidence: 0.8,
          timestamp: Date.now(),
          metadata: {
            kind: 'player',
            action: 'move',
            distance: e.distance,
            hasLineOfSight: e.hasLineOfSight,
            displayName: e.displayName,
          },
        }
      },
    },
  },
  heard: {
    sound: {
      threshold: 5,
      key: 'sound:ambient',
      buildSignal: (event) => {
        const e = event as Extract<RawPerceptionEvent, { modality: 'heard', kind: 'sound' }>
        return {
          type: 'environmental_anomaly',
          description: `Heard sound: ${e.soundId}`,
          sourceId: e.soundId,
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            kind: 'sound',
            action: 'sound',
            soundId: e.soundId,
            distance: e.distance,
          },
        }
      },
    },
  },
  felt: {
    damage_taken: {
      threshold: 1, // Damage is immediately salient
      key: 'felt:damage',
      buildSignal: () => ({
        type: 'saliency_high',
        description: 'Taken damage!',
        confidence: 1.0,
        timestamp: Date.now(),
        metadata: {
          kind: 'felt',
          action: 'damage',
        },
      }),
    },
    item_collected: {
      threshold: 3,
      key: 'felt:pickup',
      buildSignal: () => ({
        type: 'entity_attention',
        description: 'Picked up an item',
        confidence: 1.0,
        timestamp: Date.now(),
        metadata: {
          kind: 'felt',
          action: 'pickup',
        },
      }),
    },
  },
  system: {
    system_message: {
      threshold: 1, // System messages are immediately salient
      key: 'system:message',
      buildSignal: (event) => {
        const e = event as Extract<RawPerceptionEvent, { modality: 'system', kind: 'system_message' }>
        return {
          type: 'system_message',
          description: e.message,
          sourceId: 'system',
          confidence: 1.0,
          timestamp: Date.now(),
          metadata: {
            message: e.message,
            position: e.position,
          },
        }
      },
    },
  },
}
