<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import ArrowTransition from './ArrowTransition.vue'
import MultipleBlocksRevealTransition from './MultipleBlocksRevealTransition.vue'
import SlideTransition from './SlideTransition.vue'
import SlopeSlideTransition from './SlopeSlideTransition.vue'

withDefaults(defineProps<{
  primaryColor?: string
  secondaryColor?: string
}>(), {
  primaryColor: '#666',
  secondaryColor: '#ccc',
})

type TransitionComponent =
  | typeof SlideTransition
  | typeof SlopeSlideTransition
  | typeof ArrowTransition
  | typeof MultipleBlocksRevealTransition

const router = useRouter()
const showTransition = ref(false)
const activeTransitionName = ref('')

const transitions = shallowRef<Record<string, {
  component: TransitionComponent
  duration: number
}>>({
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
})

function triggerTransition(name: string) {
  return new Promise<void>((resolve) => {
    const transition = transitions.value[name]
    if (!transition) {
      console.error(`Transition ${name} not found`)
      resolve()
      return
    }

    if (showTransition.value) {
      activeTransitionName.value = ''
      showTransition.value = false

      setTimeout(() => {
        activeTransitionName.value = name
        showTransition.value = true

        setTimeout(() => {
          showTransition.value = false
          activeTransitionName.value = ''
          resolve()
        }, transition.duration)
      }, 50)
    }
    else {
      activeTransitionName.value = name
      showTransition.value = true

      setTimeout(() => {
        showTransition.value = false
        activeTransitionName.value = ''
        resolve()
      }, transition.duration)
    }
  })
}

router.beforeEach((to, _from, next) => {
  triggerTransition(to.meta.stageTransition as string).then(next)
})
</script>

<template>
  <slot />
  <template v-if="showTransition">
    <template v-if="transitions[activeTransitionName]">
      <component :is="transitions[activeTransitionName].component" :primary-color="primaryColor" :secondary-color="secondaryColor" />
    </template>
  </template>
</template>
