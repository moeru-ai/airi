import type { VRMCore } from '@pixiv/three-vrm-core'

import { computed, ref } from 'vue'

interface EmotionState {
  expression?: {
    name: string
    value: number
    duration?: number
    curve?: (t: number) => number
  }[]
  blendDuration?: number
}

export function useVRMEmote(vrm: VRMCore) {
  const currentEmotion = ref<string | null>(null)
  const isTransitioning = ref(false)
  const transitionProgress = ref(0)
  const currentExpressionValues = ref(new Map<string, number>())
  const targetExpressionValues = ref(new Map<string, number>())
  const resetTimeout = ref<number>()

  // Utility functions
  const lerp = (start: number, end: number, t: number): number => {
    return start + (end - start) * t
  }

  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  }

  const clampIntensity = (value: number): number => {
    return Math.min(1, Math.max(0, value))
  }

  // Emotion states definition — values are the "full weight" targets;
  // actual applied weight is value × clamped intensity.
  // Using slightly lower values (0.7–0.8) for primary expressions to
  // prevent the "too raw / smiles too much" problem reported in #590.
  const emotionStates = new Map<string, EmotionState>([
    ['happy', {
      expression: [
        { name: 'happy', value: 0.7, duration: 0.3 },
        { name: 'aa', value: 0.2 },
      ],
      blendDuration: 0.4,
    }],
    ['sad', {
      expression: [
        { name: 'sad', value: 0.7 },
        { name: 'oh', value: 0.15 },
      ],
      blendDuration: 0.4,
    }],
    ['angry', {
      expression: [
        { name: 'angry', value: 0.7 },
        { name: 'ee', value: 0.3 },
      ],
      blendDuration: 0.3,
    }],
    ['surprised', {
      expression: [
        { name: 'surprised', value: 0.8 },
        { name: 'oh', value: 0.4 },
      ],
      blendDuration: 0.15,
    }],
    ['neutral', {
      expression: [
        { name: 'neutral', value: 1.0 },
      ],
      blendDuration: 0.6,
    }],
    ['think', {
      expression: [
        { name: 'think', value: 0.7 },
      ],
      blendDuration: 0.5,
    }],
    ['relaxed', {
      expression: [
        { name: 'relaxed', value: 0.7 },
      ],
      blendDuration: 0.4,
    }],
  ])

  // Morphs the emote owns: only expressions referenced by emotion states.
  // Blink and animation-driven expressions stay under their own controllers,
  // so the emote must never assert values (including 0) for them.
  const ownedExpressionNames = (modelNames: string[]): string[] => {
    const owned = new Set<string>()
    for (const state of emotionStates.values()) {
      for (const expr of state.expression || []) {
        const match = modelNames.find(n => n.toLowerCase() === expr.name.toLowerCase())
        if (match)
          owned.add(match)
      }
    }
    return [...owned]
  }

  // Viseme mouth morphs driven by lip sync; the emote yields these while
  // speech is active so phoneme weights are not overwritten.
  const VISEME_NAMES = new Set(['aa', 'ee', 'ih', 'oh', 'ou'])

  const clearResetTimeout = () => {
    if (resetTimeout.value) {
      clearTimeout(resetTimeout.value)
      resetTimeout.value = undefined
    }
  }

  const setEmotion = (emotionName: string, intensity = 1) => {
    clearResetTimeout()

    if (!emotionStates.has(emotionName)) {
      console.warn(`Emotion ${emotionName} not found`)
      return
    }

    const emotionState = emotionStates.get(emotionName)!
    currentEmotion.value = emotionName
    isTransitioning.value = true
    transitionProgress.value = 0

    // Store current expression values as starting point BEFORE resetting,
    // so the lerp transition starts from the actual displayed values
    // instead of snapping to 0 first (fixes #590).
    currentExpressionValues.value.clear()
    targetExpressionValues.value.clear()

    const normalizedIntensity = clampIntensity(intensity)

    if (vrm.expressionManager) {
      // Capture current values only for morphs the emote owns, so the lerp
      // transition starts from the actual displayed values instead of
      // snapping to 0 first (fixes #590). Unrelated expressions (blink,
      // animation-driven morphs) are left to their own controllers.
      const expressionNames = Object.keys(vrm.expressionManager.expressionMap)
      for (const name of ownedExpressionNames(expressionNames)) {
        const currentValue = vrm.expressionManager.getValue(name) || 0
        currentExpressionValues.value.set(name, currentValue)
        // Default target is 0 for owned expressions not in the target emotion
        targetExpressionValues.value.set(name, 0)
      }
    }

    // Override target values for specified expressions in the emotion state
    for (const expr of emotionState.expression || []) {
      let actualName = expr.name
      if (vrm.expressionManager) {
        const modelNames = Object.keys(vrm.expressionManager.expressionMap)
        const match = modelNames.find(n => n.toLowerCase() === expr.name.toLowerCase())
        if (match) {
          actualName = match
        }
      }
      targetExpressionValues.value.set(actualName, expr.value * normalizedIntensity)
    }
  }

  const setEmotionWithResetAfter = (emotionName: string, ms: number, intensity = 1) => {
    clearResetTimeout()
    setEmotion(emotionName, intensity)

    // Set timeout to reset to neutral
    resetTimeout.value = setTimeout(() => {
      setEmotion('neutral')
      resetTimeout.value = undefined
    }, ms) as unknown as number
  }

  const isEmoteActive = computed(() => {
    // Check if the current emotion targets any supported morph with a non-zero weight
    const hasActiveTarget = currentEmotion.value !== null
      && currentEmotion.value !== 'neutral'
      && Array.from(targetExpressionValues.value.values()).some(val => val > 0.001)

    if (hasActiveTarget)
      return true

    // When transitioning (e.g. returning to neutral), remain active while non-zero
    // expression weights are still fading out to prevent procedural blink conflicts.
    if (isTransitioning.value) {
      return Array.from(currentExpressionValues.value.values()).some(val => val > 0.001)
    }

    return false
  })

  const update = (deltaTime: number, options?: { skipVisemes?: boolean }) => {
    if (!currentEmotion.value)
      return

    // While lip sync owns the mouth, viseme writes are skipped but the
    // transition and reset lifecycle keep advancing, so emotions triggered
    // during speech are not lost.
    const skip = options?.skipVisemes
      ? (name: string) => VISEME_NAMES.has(name.toLowerCase())
      : () => false

    if (isTransitioning.value) {
      const emotionState = emotionStates.get(currentEmotion.value)!
      const blendDuration = emotionState.blendDuration || 0.3

      transitionProgress.value += deltaTime / blendDuration
      const isSettling = transitionProgress.value >= 1.0
      if (isSettling) {
        transitionProgress.value = 1.0
        isTransitioning.value = false
      }

      // Update all expressions with lerp (or terminal targets if isSettling)
      for (const [exprName, targetValue] of targetExpressionValues.value) {
        if (skip(exprName))
          continue
        const startValue = currentExpressionValues.value.get(exprName) || 0
        const currentValue = isSettling
          ? targetValue
          : lerp(
              startValue,
              targetValue,
              easeInOutCubic(transitionProgress.value),
            )
        vrm.expressionManager?.setValue(exprName, currentValue)
      }

      // Once the neutral transition completes and terminal weights are written,
      // clear targets and reset currentEmotion to release morph ownership.
      if (isSettling && currentEmotion.value === 'neutral') {
        currentEmotion.value = null
        currentExpressionValues.value.clear()
        targetExpressionValues.value.clear()
      }
    }
    else {
      // Hold target expression values across render frames so other updates don't clear them
      for (const [exprName, targetValue] of targetExpressionValues.value) {
        if (skip(exprName))
          continue
        vrm.expressionManager?.setValue(exprName, targetValue)
      }
    }
  }

  const addEmotionState = (emotionName: string, state: EmotionState) => {
    emotionStates.set(emotionName, state)
  }

  const removeEmotionState = (emotionName: string) => {
    emotionStates.delete(emotionName)
  }

  // Cleanup function
  const dispose = () => {
    clearResetTimeout()
  }

  return {
    currentEmotion,
    isTransitioning,
    isEmoteActive,
    setEmotion,
    setEmotionWithResetAfter,
    update,
    addEmotionState,
    removeEmotionState,
    dispose,
  }
}
