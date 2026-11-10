import { neutralPose } from '@proj-airi/model-driver-magic-live2d'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import { useLive2DMotionMagic } from './index'

function createDataset(amplitude = 0.5) {
  const samples = Array.from({ length: 180 }, (_, index) => {
    const phase = index / 30 * Math.PI * 2
    return {
      ...neutralPose,
      atMs: index * 34,
      headX: Math.sin(phase) * amplitude,
      headY: Math.cos(phase) * 0.25,
    }
  })
  return {
    durationMs: samples.at(-1)!.atMs,
    samples,
  }
}

describe('live2d MAGIC motion', () => {
  it('initializes from a dataset and changes seeds without Web Crypto', async () => {
    const scope = effectScope()
    const publishPose = vi.fn()
    const releasePose = vi.fn()
    let now = 0
    const motion = scope.run(() => useLive2DMotionMagic({
      dataset: createDataset(),
      publishPose,
      releasePose,
      now: () => ++now,
      random: () => 0.5,
    }))!

    await motion.initialize()
    motion.randomizeSeed()

    expect(motion.status.value).toBe('ready')
    expect(motion.model.value?.method).toBe('var')
    expect(motion.fitDurationMs.value).toBe(1)
    expect(motion.seed.value).toBe(2_147_483_648)
    expect(publishPose).not.toHaveBeenCalled()
    expect(releasePose).not.toHaveBeenCalled()

    scope.stop()
  })

  it('blends to a new dataset during playback without a release', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const scope = effectScope()
    const publishPose = vi.fn()
    const releasePose = vi.fn()
    const calm = createDataset(0.2)
    const excited = createDataset(0.8)
    const dataset = shallowRef(calm)
    const motion = scope.run(() => useLive2DMotionMagic({
      dataset,
      transitionMs: 600,
      publishPose,
      releasePose,
    }))!

    await motion.initialize()
    motion.prepare(excited)
    motion.start()
    const calmModel = motion.model.value
    dataset.value = excited
    await nextTick()

    expect(motion.status.value).toBe('playing')
    expect(motion.model.value).not.toBe(calmModel)
    expect(releasePose).not.toHaveBeenCalled()

    dataset.value = calm
    await nextTick()
    expect(motion.model.value).toBe(calmModel)

    scope.stop()
    expect(releasePose).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
