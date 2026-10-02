import type { VoicePlaybackSource } from './voice-playback'

import { LeaseTable } from '@proj-airi/core-agent'
import { describe, expect, it } from 'vitest'

import { holdVoiceDuringPlayback, playbackHolder } from './voice-playback'

function fakePipeline(turns: Set<string>) {
  const listeners = new Map<string, (payload: unknown) => void>()
  const pipeline: VoicePlaybackSource = {
    on: (event, listener) => {
      listeners.set(event, listener as (payload: unknown) => void)
      return () => listeners.delete(event)
    },
    hasTurn: turnId => turns.has(turnId),
  }
  const emit = (event: string, payload: unknown) => listeners.get(event)?.(payload)
  return { pipeline, emit }
}

describe('voice playback lease', () => {
  // ROOT CAUSE:
  // The voice lease ended with generation, so calm work started while the previous reply still played.
  it('keeps the voice for a turn that still plays after its run, until the turn ends', () => {
    const leases = new LeaseTable()
    const { pipeline, emit } = fakePipeline(new Set(['turn']))
    const playback = holdVoiceDuringPlayback(pipeline, leases)
    leases.acquire('voice', 'run', { salience: 0.7 })

    expect(playback.hold('turn', 'run')).toBe(true)
    leases.releaseAll('run')
    expect(leases.holder('voice')).toMatchObject({ holder: playbackHolder('turn'), interruptible: true })
    expect(leases.acquire('voice', 'calm-notification', { salience: 0.5 }).granted).toBe(false)

    emit('onTurnEnd', 'turn')
    expect(leases.holder('voice')).toBeUndefined()
  })

  it('holds nothing for a turn that already ended or a run without the voice', () => {
    const leases = new LeaseTable()
    const { pipeline } = fakePipeline(new Set(['turn']))
    const playback = holdVoiceDuringPlayback(pipeline, leases)

    expect(playback.hold('turn', 'run')).toBe(false)
    leases.acquire('voice', 'run', { salience: 0.7 })
    expect(playback.hold('finished-turn', 'run')).toBe(false)
    expect(leases.holder('voice')?.holder).toBe('run')
  })

  it('releases on cancellation and never releases a lease that urgent work took over', () => {
    const leases = new LeaseTable()
    const { pipeline, emit } = fakePipeline(new Set(['first', 'second']))
    const playback = holdVoiceDuringPlayback(pipeline, leases)

    leases.acquire('voice', 'first-run', { salience: 0.7 })
    playback.hold('first', 'first-run')
    emit('onTurnCancel', { turnId: 'first', reason: 'new-message' })
    expect(leases.holder('voice')).toBeUndefined()

    leases.acquire('voice', 'second-run', { salience: 0.7 })
    playback.hold('second', 'second-run')
    leases.acquire('voice', 'urgent-run', { salience: 0.9, preempt: true })
    emit('onTurnCancel', { turnId: 'second', reason: 'interrupt' })
    expect(leases.holder('voice')?.holder).toBe('urgent-run')
  })
})
