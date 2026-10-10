import type { DesktopReactionIntent } from '../../shared/desktop-companion'
import type { DesktopReactionContext } from './desktop-reaction'

import { describe, expect, it } from 'vitest'

import { DesktopReactionGate } from './desktop-reaction'

const intent: DesktopReactionIntent = { requestId: 'request', notificationId: 'event', motion: 'wave', priority: 'high', createdAt: 100, expiresAt: 5100 }
const context: DesktopReactionContext = { modelId: 'model', waveAvailable: true, motionOwner: 'idle', paused: false, doNotDisturb: false, reducedMotion: false, enabled: true }

describe('desktop priority reaction gate', () => {
  it('maps a fresh intent to one bounded wave on the current model', () => {
    const gate = new DesktopReactionGate()
    expect(gate.consume(intent, context, 200)).toEqual({ modelId: 'model', requestId: 'request', motionId: 'wave', loop: false, duration: 5 })
    expect(gate.consume(intent, context, 201)).toBeNull()
  })

  it.each(['manual', 'assistant', 'unknown'] as const)('does not interrupt %s motion ownership', (motionOwner) => {
    const gate = new DesktopReactionGate()
    expect(gate.consume(intent, { ...context, motionOwner }, 200)).toBeNull()
    expect(gate.consume(intent, context, 300)).toBeNull()
  })

  it.each(['paused', 'doNotDisturb', 'reducedMotion'] as const)('suppresses gestures for %s', (key) => {
    expect(new DesktopReactionGate().consume(intent, { ...context, [key]: true }, 200)).toBeNull()
  })

  it('requires a supported, selected model and an enabled host', () => {
    expect(new DesktopReactionGate().consume(intent, { ...context, modelId: undefined }, 200)).toBeNull()
    expect(new DesktopReactionGate().consume(intent, { ...context, waveAvailable: false }, 200)).toBeNull()
    expect(new DesktopReactionGate().consume(intent, { ...context, enabled: false }, 200)).toBeNull()
  })

  it('rejects expired and future-dated intents rather than replaying them', () => {
    expect(new DesktopReactionGate().consume(intent, context, 5100)).toBeNull()
    expect(new DesktopReactionGate().consume(intent, context, 99)).toBeNull()
  })
})
