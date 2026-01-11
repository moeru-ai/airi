import type { PerceptionFrame } from './frame'
import type { RawPerceptionEvent } from './raw-events'
import type { PerceptionStage } from './stage'

function getDistance(raw: RawPerceptionEvent): number | undefined {
    return (raw as any).distance
}

function getEntityId(raw: RawPerceptionEvent): string | undefined {
    return (raw as any).entityId
}

function getDisplayName(raw: RawPerceptionEvent): string | undefined {
    return (raw as any).displayName
}

export class NormalizerStage implements PerceptionStage {
    public readonly name = 'normalizer'

    private readonly lastMovedEmitAt = new Map<string, number>()
    private readonly lastSneakValue = new Map<string, boolean>()

    constructor(
        private readonly deps: {
            maxDistance: number
        },
    ) { }

    public handle(frame: PerceptionFrame): PerceptionFrame | null {
        if (frame.kind !== 'world_raw')
            return frame

        const raw = frame.raw as RawPerceptionEvent

        const distance = getDistance(raw)
        if (typeof distance === 'number') {
            if (distance > this.deps.maxDistance)
                return null

            frame.norm = {
                ...frame.norm,
                distance,
                within32: distance <= this.deps.maxDistance,
                entityId: getEntityId(raw),
                displayName: getDisplayName(raw),
            }

            // Drop expensive LOS computation for now.
            if (raw.modality === 'sighted') {
                ; (raw as any).hasLineOfSight = distance <= this.deps.maxDistance
            }
        }

        // Throttle spammy entity movement signals
        if (raw.modality === 'sighted' && (raw as any).kind === 'entity_moved') {
            const entityId = getEntityId(raw) ?? 'unknown'
            const now = Date.now()
            const last = this.lastMovedEmitAt.get(entityId) ?? 0
            if (now - last < 100)
                return null
            this.lastMovedEmitAt.set(entityId, now)
        }

        // Dedupe sneak toggle state (mineflayer may emit frequent updates)
        if (raw.modality === 'sighted' && (raw as any).kind === 'sneak_toggle') {
            const entityId = getEntityId(raw) ?? 'unknown'
            const sneaking = !!(raw as any).sneaking
            const prev = this.lastSneakValue.get(entityId)
            if (prev === sneaking)
                return null
            this.lastSneakValue.set(entityId, sneaking)
        }

        return frame
    }
}
