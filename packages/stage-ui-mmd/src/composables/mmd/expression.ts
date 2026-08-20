import type { MorphSlot } from '../../constants/morphs'
import type { MorphController } from './morph'

import { ref } from 'vue'

import { Emotion } from '../../constants/emotions'
import { EMOTION_MORPHS } from '../../constants/morphs'

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function clampIntensity(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** All emotion-related morph slots, so transitions can zero the untargeted ones. */
const EXPRESSION_SLOTS: MorphSlot[] = ['smile', 'anger', 'sad', 'surprise', 'troubled', 'serious']

/**
 * Emotion-driven facial morphs for MMD models.
 *
 * Mirrors the VRM emote composable: each emotion declares target morph
 * weights and a blend duration, and `update(delta)` cross-fades from the
 * currently displayed weights to the target with an ease-in-out curve so
 * emotion changes never snap.
 *
 * Lip-sync owns the vowel slots, so emotions only touch expression slots
 * (smile/anger/...) plus, for a few emotions, a small fixed vowel accent that
 * lip-sync overrides as soon as speech starts.
 */
export function useMMDEmote(morphs: MorphController) {
  const currentEmotion = ref<Emotion | null>(null)
  const isTransitioning = ref(false)
  const transitionProgress = ref(0)
  const startWeights = new Map<MorphSlot, number>()
  const targetWeights = new Map<MorphSlot, number>()
  let resetTimeout: ReturnType<typeof setTimeout> | undefined

  function clearResetTimeout() {
    if (resetTimeout) {
      clearTimeout(resetTimeout)
      resetTimeout = undefined
    }
  }

  function setEmotion(emotion: Emotion, intensity = 1) {
    clearResetTimeout()

    const state = EMOTION_MORPHS[emotion]
    if (!state) {
      console.warn(`[mmd] emotion ${emotion} not found`)
      return
    }

    currentEmotion.value = emotion
    isTransitioning.value = true
    transitionProgress.value = 0
    startWeights.clear()
    targetWeights.clear()

    const normalized = clampIntensity(intensity)

    // Capture where each expression slot currently sits so the cross-fade
    // starts from the live value instead of snapping to zero first.
    for (const slot of EXPRESSION_SLOTS) {
      startWeights.set(slot, morphs.get(slot))
      targetWeights.set(slot, 0)
    }

    for (const influence of state.influences) {
      startWeights.set(influence.slot, morphs.get(influence.slot))
      targetWeights.set(influence.slot, influence.value * normalized)
    }
  }

  function setEmotionWithResetAfter(emotion: Emotion, ms: number, intensity = 1) {
    clearResetTimeout()
    setEmotion(emotion, intensity)
    resetTimeout = setTimeout(() => {
      setEmotion(Emotion.Neutral)
      resetTimeout = undefined
    }, ms)
  }

  function update(delta: number) {
    if (!isTransitioning.value || !currentEmotion.value)
      return

    const blendDuration = EMOTION_MORPHS[currentEmotion.value].blendDuration || 0.3
    transitionProgress.value += delta / blendDuration
    if (transitionProgress.value >= 1) {
      transitionProgress.value = 1
      isTransitioning.value = false
    }

    const t = easeInOutCubic(transitionProgress.value)
    for (const [slot, target] of targetWeights) {
      const start = startWeights.get(slot) ?? 0
      morphs.set(slot, lerp(start, target, t))
    }
  }

  function dispose() {
    clearResetTimeout()
  }

  return {
    currentEmotion,
    isTransitioning,
    setEmotion,
    setEmotionWithResetAfter,
    update,
    dispose,
  }
}
