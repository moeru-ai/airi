import { describe, expect, it, vi } from 'vitest'

import type { PerceptionFrame } from './frame'
import { NormalizerStage } from './normalizer-stage'

function makeWorldFrame(raw: any): PerceptionFrame {
    return {
        id: 'p_test',
        ts: 0,
        source: 'minecraft',
        kind: 'world_raw',
        raw,
        signals: [],
    }
}

describe('NormalizerStage', () => {
    it('drops frames beyond maxDistance when distance is present', () => {
        const stage = new NormalizerStage({ maxDistance: 32 })
        const frame = makeWorldFrame({ modality: 'heard', kind: 'sound', distance: 33 })
        expect(stage.handle(frame)).toBeNull()
    })

    it('sets norm fields and approximates hasLineOfSight for sighted events', () => {
        const stage = new NormalizerStage({ maxDistance: 32 })
        const raw: any = {
            modality: 'sighted',
            kind: 'arm_swing',
            entityType: 'player',
            entityId: 'e1',
            displayName: 'alice',
            distance: 10,
            hasLineOfSight: true,
            timestamp: 0,
            source: 'minecraft',
        }
        const frame = makeWorldFrame(raw)
        const out = stage.handle(frame)
        expect(out).not.toBeNull()
        expect(frame.norm?.distance).toBe(10)
        expect(frame.norm?.within32).toBe(true)
        expect((frame.raw as any).hasLineOfSight).toBe(true)
    })

    it('throttles entity_moved per entity within 100ms', () => {
        vi.useFakeTimers()
        try {
            const stage = new NormalizerStage({ maxDistance: 32 })
            const raw: any = {
                modality: 'sighted',
                kind: 'entity_moved',
                entityType: 'player',
                entityId: 'p1',
                displayName: 'alice',
                distance: 10,
                timestamp: 0,
                source: 'minecraft',
            }

            vi.setSystemTime(new Date(0))
            expect(stage.handle(makeWorldFrame({ ...raw }))).not.toBeNull()

            vi.setSystemTime(new Date(50))
            expect(stage.handle(makeWorldFrame({ ...raw }))).toBeNull()

            vi.setSystemTime(new Date(150))
            expect(stage.handle(makeWorldFrame({ ...raw }))).not.toBeNull()
        }
        finally {
            vi.useRealTimers()
        }
    })

    it('dedupes sneak_toggle with unchanged sneaking state', () => {
        const stage = new NormalizerStage({ maxDistance: 32 })

        const base: any = {
            modality: 'sighted',
            kind: 'sneak_toggle',
            entityType: 'player',
            entityId: 'p1',
            displayName: 'alice',
            distance: 10,
            hasLineOfSight: true,
            timestamp: 0,
            source: 'minecraft',
        }

        expect(stage.handle(makeWorldFrame({ ...base, sneaking: true }))).not.toBeNull()
        expect(stage.handle(makeWorldFrame({ ...base, sneaking: true }))).toBeNull()
        expect(stage.handle(makeWorldFrame({ ...base, sneaking: false }))).not.toBeNull()
    })
})
