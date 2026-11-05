import type { MotionIntent } from '@proj-airi/alice-motion'

import { describe, expect, it, vi } from 'vitest'

import { StageMotionRuntime } from './stage-motion'

let sequence = 0

function intent(semanticAction: string, extra: Partial<MotionIntent> = {}): MotionIntent {
  sequence++
  return { schemaVersion: 1, id: `bridge-${sequence}`, timestampMs: 0, source: 'llm', semanticAction, ...extra }
}

function createRuntime(knownClips: string[] = ['greeting', 'shoot', 'peace_sign', 'vrm-motion-1']) {
  const playClip = vi.fn(async (clipId: string) => knownClips.includes(clipId))
  return { runtime: new StageMotionRuntime({ playClip }, { seed: 1 }), playClip }
}

describe('stageMotionRuntime', () => {
  it('plays a scheduled clip cue on the next tick', async () => {
    const { runtime, playClip } = createRuntime()

    expect(runtime.submit(intent('peace_sign'), 0).ok).toBe(true)
    await runtime.tick(0)

    expect(playClip).toHaveBeenCalledWith('peace_sign')
    expect(runtime.stats.started).toBe(1)
  })

  it('maps NeoAlice gestures to the nearest VRM clip and counts the ones without a clip', async () => {
    const { runtime, playClip } = createRuntime()

    runtime.submit(intent('gesture_index'), 0)
    runtime.submit(intent('gesture_namaste'), 10_000)
    await runtime.tick(10_000)

    expect(playClip).toHaveBeenNthCalledWith(1, 'shoot')
    expect(playClip).toHaveBeenNthCalledWith(2, 'namaste')
    expect(runtime.stats).toMatchObject({ missingClips: 1, lastMissingClip: 'namaste' })
  })

  it('refuses a second gesture on a busy arm and keeps the reason', () => {
    const { runtime } = createRuntime()

    runtime.submit(intent('gesture_thumbup'), 0)
    expect(runtime.submit(intent('gesture_ok'), 100).ok).toBe(false)
    expect(runtime.stats.lastRefusal).toMatch(/^gesture_ok: channel rightArm is held by/)
  })

  it('accepts an imported emote by its name and plays its clip', async () => {
    const { runtime, playClip } = createRuntime()
    runtime.setEmotes([{ id: 'vrm-motion-1', name: 'Happy Spin', description: 'Spin around with joy' }])

    expect(runtime.actions.has('happy_spin')).toBe(true)
    runtime.submit(intent('happy_spin'), 0)
    await runtime.tick(0)

    expect(playClip).toHaveBeenCalledWith('vrm-motion-1')
  })

  it('keeps director intents as procedural cues and never sends them to the renderer as clips', async () => {
    const { runtime, playClip } = createRuntime()

    for (let now = 0; now <= 20_000; now += 100)
      await runtime.tick(now)

    expect(runtime.stats.generatorCues).toBeGreaterThan(3)
    expect(playClip).not.toHaveBeenCalled()
  })

  it('stops the gestures of a cancelled session and refuses its later intents', async () => {
    const { runtime } = createRuntime()
    runtime.speechStarted('turn-1', 0)
    runtime.submit(intent('peace_sign', { sessionId: 'turn-1' }), 0)

    runtime.cancelSession('turn-1', 100)
    await runtime.tick(100)

    expect(runtime.scheduler.activeCues.some(cue => cue.sessionId === 'turn-1')).toBe(false)
    expect(runtime.submit(intent('shoot', { sessionId: 'turn-1' }), 200).ok).toBe(false)
  })
})
