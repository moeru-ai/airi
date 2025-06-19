<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import ArrowTransition from './ArrowTransition.vue'
import BubbleWaveOutTransition from './BubbleWaveOutTransition.vue'
import FantasyFallTransition from './FantasyFallTransition.vue'
import MultipleBlocksRevealTransition from './MultipleBlocksRevealTransition.vue'
import RectanglesRotateTransition from './RectanglesRotateTransition.vue'
import SlideTransition from './SlideTransition.vue'
import SlopeSlideTransition from './SlopeSlideTransition.vue'

const props = defineProps<{
  primaryColor?: string
  secondaryColor?: string
  tertiaryColor?: string
  colors?: string[]
  zIndex?: number
  disableTransitions?: boolean
  usePageSpecificTransitions?: boolean
}>()

interface StageTransitionCommonParams {
  name: string
  primaryColor?: string
  secondaryColor?: string
  tertiaryColor?: string
  direction?: 'top' | 'bottom' | 'left' | 'right'
  colors?: string[]
  zIndex?: number
  pageSpecificAvailable?: boolean
}

type TransitionComponent
  = | typeof SlideTransition
    | typeof SlopeSlideTransition
    | typeof ArrowTransition
    | typeof MultipleBlocksRevealTransition
    | typeof FantasyFallTransition
    | typeof RectanglesRotateTransition
    | typeof BubbleWaveOutTransition

const router = useRouter()
const showTransition = ref(false)
const transitionStage = ref<TransitionStage>()

const activeTransitionName = ref('')
const activeStageTransitionParams = ref<StageTransitionCommonParams>()

// Define transition lifecycle events
export type TransitionStage
  = | 'before-enter' // Just before animation starts
    | 'enter-active' // Animation has started
    | 'navigation' // Time to navigate (component still decides when)
    | 'after-enter' // Entry animation completed
    | 'before-leave' // Before exit animation starts
    | 'leave-active' // Exit animation has started
    | 'after-leave' // Complete animation cycle finished

// Define hook types
type TransitionHook = (stage: TransitionStage, data: any) => void | Promise<void>
type NavigationCallback = () => void

interface TransitionOptions {
  component: TransitionComponent
  duration: number
  exitDuration?: number
  nextDelay?: number
}

const transitions = shallowRef<Record<string, TransitionOptions>>({
  'slide': {
    component: SlideTransition,
    duration: 2700,
  },
  'slope-slide': {
    component: SlopeSlideTransition,
    duration: 2700,
  },
  'arrow': {
    component: ArrowTransition,
    duration: 2700,
  },
  'multiple-blocks-reveal': {
    component: MultipleBlocksRevealTransition,
    duration: 2800,
  },
  'fantasy-fall': {
    component: FantasyFallTransition,
    duration: 2700,
  },
  'rectangles-rotate': {
    component: RectanglesRotateTransition,
    duration: 2700,
  },
  'bubble-wave-out': {
    component: BubbleWaveOutTransition,
    duration: 1000,
  },
})

// Hook system
const lifecycleHooks = ref<TransitionHook[]>([])

// Add a hook
function addTransitionHook(hook: TransitionHook): () => void {
  lifecycleHooks.value.push(hook)

  // Return function to remove the hook
  return () => {
    const index = lifecycleHooks.value.indexOf(hook)
    if (index >= 0) {
      lifecycleHooks.value.splice(index, 1)
    }
  }
}

// Trigger all hooks for a stage
async function triggerHooks(stage: TransitionStage, data: any = {}) {
  transitionStage.value = stage

  // Execute all hooks and wait for them to complete
  for (const hook of lifecycleHooks.value) {
    try {
      await Promise.resolve(hook(stage, data))
    }
    catch (error) {
      console.error(`Error in transition hook at stage "${stage}":`, error)
    }
  }
}

async function triggerTransitionAsyncFn(params: StageTransitionCommonParams, next: NavigationCallback, resolve: (value: void | PromiseLike<void>) => void) {
  if (params.name === 'none' || !params.name) {
    next()
    resolve()
    return
  }

  const transition = transitions.value[params.name]
  if (!transition) {
    console.error(`Transition ${params.name} not found`)
    next()
    resolve()
    return
  }

  // Get navigation timing from configuration, with fallback
  const navTiming = transition.nextDelay !== undefined
    ? transition.nextDelay
    : transition.duration / 3 // Fallback, but configurable

  let hasNavigated = false

  // Hook specifically for determining when to navigate
  const navigationHook = (stage: TransitionStage) => {
    if (stage === 'navigation' && !hasNavigated) {
      hasNavigated = true
      next()
    }
  }

  // Add this hook temporarily
  const removeNavHook = addTransitionHook(navigationHook)

  try {
    // Before enter
    await triggerHooks('before-enter', { transitionName: params.name })

    // Handle resetting current transition if needed
    if (showTransition.value) {
      // Fast track to exit if a transition is already active
      await triggerHooks('before-leave', { transitionName: activeTransitionName.value })
      activeTransitionName.value = ''
      activeStageTransitionParams.value = undefined
      showTransition.value = false
      await triggerHooks('after-leave', { transitionName: activeTransitionName.value })

      // Short delay before starting new transition
      await new Promise(r => setTimeout(r, 50))
    }

    // Start new transition
    activeTransitionName.value = params.name
    activeStageTransitionParams.value = params
    showTransition.value = true

    // Enter active phase
    await triggerHooks('enter-active', { transitionName: name })

    // Trigger navigation phase at the configured time
    setTimeout(async () => {
      await triggerHooks('navigation', { transitionName: params.name, config: transition })

      // Ensure navigation happens even if no hook handled it
      if (!hasNavigated) {
        hasNavigated = true
        next()
      }
    }, navTiming)

    // After enter - entry phase complete
    setTimeout(async () => {
      await triggerHooks('after-enter', { transitionName: params.name })
    }, transition.duration)

    // Before leave - start exit phase
    setTimeout(async () => {
      await triggerHooks('before-leave', { transitionName: params.name })
    }, transition.duration + 10) // Small offset after enter completes

    // Leave active - exit animation running
    setTimeout(async () => {
      await triggerHooks('leave-active', { transitionName: params.name })
    }, transition.duration + 20) // Small offset

    // After leave - completely finished
    const totalDuration = transition.exitDuration ?? 0
    setTimeout(async () => {
      showTransition.value = false
      activeTransitionName.value = ''
      activeStageTransitionParams.value = undefined
      await triggerHooks('after-leave', { transitionName: params.name })
      resolve()
    }, transition.duration + totalDuration)
  }
  catch (error) {
    console.error(error)
  }
  finally {
    // Always remove the navigation hook
    removeNavHook()

    // Safety - ensure navigation happens no matter what
    setTimeout(() => {
      if (!hasNavigated) {
        hasNavigated = true
        next()
      }
    }, transition.duration * 2) // Conservative timeout
  }
}

// Improved transition trigger with navigation callback
function triggerTransition(params: StageTransitionCommonParams, next: NavigationCallback) {
  return new Promise<void>((resolve) => {
    triggerTransitionAsyncFn(params, next, resolve)
  })
}

router.beforeEach((to, _from, next) => {
  if (props.disableTransitions) {
    next()
    return
  }

  if (typeof to.meta.stageTransition !== 'object') {
    next()
    return
  }

  const stageTransition = to.meta.stageTransition as StageTransitionCommonParams
  if (props.usePageSpecificTransitions && stageTransition.pageSpecificAvailable) {
    next()
    return
  }
  if (typeof props.primaryColor !== 'undefined') {
    stageTransition.primaryColor = props.primaryColor
  }
  if (typeof props.secondaryColor !== 'undefined') {
    stageTransition.secondaryColor = props.secondaryColor
  }
  if (typeof props.tertiaryColor !== 'undefined') {
    stageTransition.tertiaryColor = props.tertiaryColor
  }
  if (typeof props.colors !== 'undefined') {
    stageTransition.colors = props.colors
  }
  if (typeof props.zIndex !== 'undefined') {
    stageTransition.zIndex = props.zIndex
  }

  triggerTransition(stageTransition, next)
})
</script>

<template>
  <slot />
  <template v-if="showTransition">
    <template v-if="transitions[activeTransitionName]">
      <component :is="transitions[activeTransitionName].component" :stage-transition="activeStageTransitionParams" />
    </template>
  </template>
</template>
