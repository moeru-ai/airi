import type { RawPerceptionEvent } from './types/raw-events'
import type { PerceptionSignal } from './types/signals'

export interface SaliencyRule<E extends RawPerceptionEvent = RawPerceptionEvent> {
    /**
     * How many occurrences within the window are required before emitting.
     * Defaults to 5.
     */
    threshold?: number
    /**
     * Window size in ticks. Defaults to 100 ticks (~5s).
     */
    windowTicks?: number
    /**
     * Optional predicate to gate the rule.
     */
    predicate?: (event: E) => boolean
    /**
     * Counter key used to bucket occurrences.
     */
    key: (event: E) => string
    /**
     * Builds the PerceptionSignal when the rule fires.
     */
    buildSignal: (event: E) => PerceptionSignal
}

export type SaliencyRuleBook = Partial<Record<
    RawPerceptionEvent['modality'],
    Record<string, SaliencyRule>
>>

export const DEFAULT_WINDOW_TICKS = 100
export const DEFAULT_THRESHOLD = 5

export const SALIENCY_RULES: SaliencyRuleBook = {
    sighted: {
        arm_swing: {
            key: event => `punch:${(event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'arm_swing' }>).entityId}`,
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
            key: event => `teabag:${(event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'sneak_toggle' }>).entityId}`,
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
            predicate: event => (event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'entity_moved' }>).entityType === 'player',
            key: event => `move:${(event as Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'entity_moved' }>).entityId}`,
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
            key: event => `sound:${(event as Extract<RawPerceptionEvent, { modality: 'heard', kind: 'sound' }>).soundId}`,
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
            key: () => 'felt:damage',
            buildSignal: (_event) => ({
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
            key: () => 'felt:pickup',
            buildSignal: (_event) => ({
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
}
