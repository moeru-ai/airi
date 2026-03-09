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
    ['cool', {
      expression: [
        { name: 'Pixel glasses', value: 1.0 },
      ],
      blendDuration: 0.3,
    }],
  ])

  // CRITICAL: Zero out all expressions on initialization to prevent "Megazord" state
  // from models exported with dirty default weights.
  if (vrm.expressionManager) {
    // eslint-disable-next-line no-console
    console.log('[VRMExpression] Initializing: Zeroing out all expressions...')
    const expressionNames = Object.keys(vrm.expressionManager.expressionMap)
    for (const name of expressionNames) {
      vrm.expressionManager.setValue(name, 0)
    }
    vrm.expressionManager.update()
    if (typeof window !== 'undefined') {
      (window as any).__VRM_EXPRESSION_FIX_APPLIED__ = true
      // Expose the VRM instance and common debug functions globally
      ;(window as any).vrm = vrm
      ;(window as any).expressionManager = vrm.expressionManager
      ;(window as any).resetVrm = () => {
        const names = Object.keys(vrm.expressionManager!.expressionMap)
        names.forEach(n => vrm.expressionManager!.setValue(n, 0))
        vrm.expressionManager!.update()
        console.log('[VRMDebug] Reset all expression weights to 0')
      }
      ;(window as any).nuclearReset = () => {
        vrm.scene.traverse((obj) => {
          if ((obj as any).morphTargetInfluences) {
            ;(obj as any).morphTargetInfluences.fill(0)
          }
        })
        vrm.expressionManager!.update()
        console.log('[VRMDebug] Forced all morph target influences to 0 (Nuclear)')
      }
    }
  }

  const clearResetTimeout = () => {
    if (resetTimeout.value) {
      clearTimeout(resetTimeout.value)
      resetTimeout.value = undefined
    }
  }

  const setEmotion = (emotionName: string, intensity = 1) => {
    clearResetTimeout()

    // eslint-disable-next-line no-console
    console.log('[VRMExpression] setEmotion called:', { emotionName, intensity })

    if (!emotionStates.has(emotionName)) {
      // eslint-disable-next-line no-console
      console.log('[VRMExpression] Emotion not in states map, checking raw fallback...')

      let targetName = emotionName
      let isFound = !!(vrm.expressionManager && vrm.expressionManager.getExpression(targetName))

      // Case-insensitive search if exact match fails
      if (!isFound && vrm.expressionManager) {
        const lowerName = emotionName.toLowerCase()
        const match = Object.keys(vrm.expressionManager.expressionMap).find(k => k.toLowerCase() === lowerName)
        if (match) {
          // eslint-disable-next-line no-console
          console.log(`[VRMExpression] Case-insensitive match found: ${match}`)
          targetName = match
          isFound = true
        }
      }

      if (isFound) {
        // eslint-disable-next-line no-console
        console.log(`[VRMExpression] Falling back to raw expression: ${targetName}`)
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

    // Store current expression values as starting point BEFORE resetting,
    // so the lerp transition starts from the actual displayed values
    // instead of snapping to 0 first (fixes #590).
    currentExpressionValues.value.clear()
    targetExpressionValues.value.clear()

    const normalizedIntensity = clampIntensity(intensity)

    if (vrm.expressionManager) {
      // Capture current values for all expressions we'll be transitioning
      const expressionNames = Object.keys(vrm.expressionManager.expressionMap)
      for (const name of expressionNames) {
        const currentValue = vrm.expressionManager.getValue(name) || 0
        currentExpressionValues.value.set(name, currentValue)
        // Default target is 0 for expressions not in the target emotion
        targetExpressionValues.value.set(name, 0)
      }
    }

    // Override target values for specified expressions in the emotion state
    for (const expr of emotionState.expression || []) {
      const normalizedExprIntensity = expr.value * normalizedIntensity
      let targetName = expr.name

      // Case-insensitive lookup for individual expressions in the state list
      if (vrm.expressionManager && !vrm.expressionManager.getExpression(targetName)) {
        const lowerName = targetName.toLowerCase()
        const match = Object.keys(vrm.expressionManager.expressionMap).find(k => k.toLowerCase() === lowerName)
        if (match) {
          targetName = match
        }
      }

      targetExpressionValues.value.set(targetName, normalizedExprIntensity)
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

    // Update all expressions
    frameCounter++
    const shouldLog = frameCounter % 30 === 0 // Log twice per second

    for (const [exprName, targetValue] of targetExpressionValues.value) {
      const startValue = currentExpressionValues.value.get(exprName) || 0
      const currentValue = lerp(
        startValue,
        targetValue,
        easeInOutCubic(transitionProgress.value),
      )

      if (shouldLog && currentValue > 0.01) {
        // eslint-disable-next-line no-console
        console.log(`[VRMExpression] Applying: ${exprName} = ${currentValue.toFixed(2)} (target: ${targetValue})`)
      }

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
