import type { VRMCore } from '@pixiv/three-vrm-core'

import { ref } from 'vue'

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

  // Emotion states definition
  const emotionStates = new Map<string, EmotionState>([
    ['happy', {
      expression: [
        { name: 'happy', value: 1.0, duration: 0.3 },
        { name: 'aa', value: 0.3 },
      ],
      blendDuration: 0.3,
    }],
    ['sad', {
      expression: [
        { name: 'sad', value: 1.0 },
        { name: 'oh', value: 0.2 },
      ],
      blendDuration: 0.3,
    }],
    ['angry', {
      expression: [
        { name: 'angry', value: 1.0 },
        { name: 'ee', value: 0.4 },
      ],
      blendDuration: 0.2,
    }],
    ['surprised', {
      expression: [
        { name: 'Surprised', value: 1.0 },
        { name: 'oh', value: 0.6 },
      ],
      blendDuration: 0.1,
    }],
    ['neutral', {
      expression: [
        { name: 'neutral', value: 1.0 },
      ],
      blendDuration: 0.5,
    }],
  ])

  const clearResetTimeout = () => {
    if (resetTimeout.value) {
      clearTimeout(resetTimeout.value)
      resetTimeout.value = undefined
    }
  }

  const setEmotion = (emotionName: string) => {
    clearResetTimeout()

    if (!emotionStates.has(emotionName)) {
      console.warn(`Emotion ${emotionName} not found`)
      return
    }

    const emotionState = emotionStates.get(emotionName)!
    currentEmotion.value = emotionName
    isTransitioning.value = true
    transitionProgress.value = 0

    // Reset all existing expressions to 0 first
    if (vrm.expressionManager) {
      // Get all expression names from the VRM model
      const expressionNames = Object.keys(vrm.expressionManager.expressionMap)
      for (const name of expressionNames) {
        vrm.expressionManager.setValue(name, 0)
      }
    }

    // Store current expression values as starting point
    currentExpressionValues.value.clear()
    targetExpressionValues.value.clear()

    // Store all current expression values
    for (const expr of emotionState.expression || []) {
      const currentValue = vrm.expressionManager?.getValue(expr.name) || 0
      currentExpressionValues.value.set(expr.name, currentValue)
      targetExpressionValues.value.set(expr.name, expr.value)
    }
  }

  const setEmotionWithResetAfter = (emotionName: string, ms: number) => {
    clearResetTimeout()
    setEmotion(emotionName)

    // Set timeout to reset to neutral
    resetTimeout.value = setTimeout(() => {
      setEmotion('neutral')
      resetTimeout.value = undefined
    }, ms) as unknown as number
  }

  const update = (deltaTime: number) => {
    if (!isTransitioning.value || !currentEmotion.value)
      return

    const emotionState = emotionStates.get(currentEmotion.value)!
    const blendDuration = emotionState.blendDuration || 0.3

    transitionProgress.value += deltaTime / blendDuration
    if (transitionProgress.value >= 1.0) {
      transitionProgress.value = 1.0
      isTransitioning.value = false
    }

    // Update all expressions
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
