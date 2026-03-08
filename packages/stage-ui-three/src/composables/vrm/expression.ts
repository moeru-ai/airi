import type { VRMCore } from '@pixiv/three-vrm-core'

import { ref } from 'vue'

let frameCounter = 0

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
  // Only stores expressions that are part of the CURRENT emotion transition.
  // Everything else (blink, lip-sync, custom overlays) is left untouched.
  const currentExpressionValues = ref(new Map<string, number>())
  const targetExpressionValues = ref(new Map<string, number>())
  // Track which expressions the PREVIOUS emotion was managing,
  // so we can fade them out when switching emotions.
  const previouslyManagedExpressions = ref(new Set<string>())
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
    ['cool', {
      expression: [
        { name: 'Pixel glasses', value: 1.0 },
      ],
      blendDuration: 0.3,
    }],
  ])

  // Expose the VRM for debugging (no megazord hack — the library handles defaults correctly)
  if (vrm.expressionManager) {
    if (typeof window !== 'undefined') {
      ;(window as any).vrm = vrm
      ;(window as any).expressionManager = vrm.expressionManager
    }
  }

  const clearResetTimeout = () => {
    if (resetTimeout.value) {
      clearTimeout(resetTimeout.value)
      resetTimeout.value = undefined
    }
  }

  const resolveExpressionName = (name: string): string | null => {
    if (!vrm.expressionManager)
      return null

    // Direct match
    if (vrm.expressionManager.getExpression(name))
      return name

    // Case-insensitive fallback
    const lowerName = name.toLowerCase()
    const match = Object.keys(vrm.expressionManager.expressionMap).find(
      k => k.toLowerCase() === lowerName,
    )
    return match || null
  }

  const setEmotion = (emotionName: string, intensity = 1) => {
    clearResetTimeout()

    // eslint-disable-next-line no-console
    console.log('[VRMExpression] setEmotion called:', { emotionName, intensity })

    if (!emotionStates.has(emotionName)) {
      // Try to auto-register as a raw expression
      const targetName = resolveExpressionName(emotionName)
      if (targetName) {
        emotionStates.set(emotionName, {
          expression: [{ name: targetName, value: intensity }],
          blendDuration: 0.3,
        })
      }
      else {
        console.warn(`[VRMExpression] Emotion ${emotionName} not found and is not a valid VRM expression`)
        return
      }
    }

    const emotionState = emotionStates.get(emotionName)!
    // eslint-disable-next-line no-console
    console.log('[VRMExpression] Target state found:', emotionState)
    currentEmotion.value = emotionName
    isTransitioning.value = true
    transitionProgress.value = 0

    // Clear previous tracking
    currentExpressionValues.value.clear()
    targetExpressionValues.value.clear()

    const normalizedIntensity = clampIntensity(intensity)

    // ADDITIVE FIX: Only fade out expressions that the PREVIOUS emotion was managing.
    // Don't touch anything else (blink, lip-sync, custom overlays stay alive).
    for (const prevExprName of previouslyManagedExpressions.value) {
      const currentValue = vrm.expressionManager?.getValue(prevExprName) || 0
      currentExpressionValues.value.set(prevExprName, currentValue)
      targetExpressionValues.value.set(prevExprName, 0) // Fade out old emotions
    }

    // Set up target values for the NEW emotion's expressions
    for (const expr of emotionState.expression || []) {
      const resolvedName = resolveExpressionName(expr.name)
      if (!resolvedName)
        continue

      const currentValue = vrm.expressionManager?.getValue(resolvedName) || 0
      currentExpressionValues.value.set(resolvedName, currentValue)
      targetExpressionValues.value.set(resolvedName, expr.value * normalizedIntensity)
    }

    // Update the set of managed expressions for next transition
    previouslyManagedExpressions.value.clear()
    for (const expr of emotionState.expression || []) {
      const resolvedName = resolveExpressionName(expr.name)
      if (resolvedName) {
        previouslyManagedExpressions.value.add(resolvedName)
      }
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

  const update = (deltaTime: number) => {
    if (!currentEmotion.value) {
      if (isTransitioning.value) {
        isTransitioning.value = false
        transitionProgress.value = 0
      }
      return
    }

    const emotionState = emotionStates.get(currentEmotion.value)!
    if (isTransitioning.value) {
      const blendDuration = emotionState.blendDuration || 0.3
      transitionProgress.value += deltaTime / blendDuration
      if (transitionProgress.value >= 1.0) {
        transitionProgress.value = 1.0
        isTransitioning.value = false
      }
    }

    // ADDITIVE FIX: Only update expressions we're explicitly managing
    for (const [exprName, targetValue] of targetExpressionValues.value) {
      const startValue = currentExpressionValues.value.get(exprName) || 0
      const currentValue = lerp(
        startValue,
        targetValue,
        easeInOutCubic(transitionProgress.value),
      )


      vrm.expressionManager?.setValue(exprName, currentValue)
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
    setEmotion,
    setEmotionWithResetAfter,
    update,
    addEmotionState,
    removeEmotionState,
    dispose,
  }
}
