import { describe, expect, it } from 'vitest'

import { AttentionDetector } from './attention-detector'

function makeLogger() {
    const logger: any = {
        withFields: () => logger,
        withError: () => logger,
        log: () => { },
        warn: () => { },
        error: () => { },
    }
    return logger
}

describe('AttentionDetector', () => {
    it('emits punch attention after 3 arm_swing events', () => {
        const emitted: any[] = []
        const detector = new AttentionDetector({
            logger: makeLogger(),
            onAttention: payload => emitted.push(payload),
        })

        const base: any = {
            modality: 'sighted',
            kind: 'arm_swing',
            entityType: 'player',
            entityId: 'p1',
            displayName: 'alice',
            distance: 10,
            hasLineOfSight: true,
            timestamp: Date.now(),
            source: 'minecraft',
        }

        detector.ingest({ ...base })
        detector.ingest({ ...base })
        detector.ingest({ ...base })

        expect(emitted.length).toBe(1)
        expect(emitted[0]).toMatchObject({
            kind: 'player',
            playerAction: 'punch',
            playerName: 'alice',
        })
    })

    it('emits sound attention (gated per soundId)', () => {
        const emitted: any[] = []
        const detector = new AttentionDetector({
            logger: makeLogger(),
            onAttention: payload => emitted.push(payload),
        })

        detector.ingest({
            modality: 'heard',
            kind: 'sound',
            soundId: 's1',
            distance: 5,
            timestamp: Date.now(),
            source: 'minecraft',
        } as any)

        detector.ingest({
            modality: 'heard',
            kind: 'sound',
            soundId: 's1',
            distance: 5,
            timestamp: Date.now(),
            source: 'minecraft',
        } as any)

        expect(emitted.length).toBe(1)
        expect(emitted[0]).toMatchObject({
            kind: 'player',
            playerAction: 'sound',
        })
    })
})
