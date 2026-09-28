<script setup lang="ts">
import type { Ref } from 'vue'

import type { StartupSceneState } from '../../../composables/startup-scene'

import StartupScreen from '@proj-airi/ui-loading-screens/startup-screen'

import { nextTick, onMounted, provide, ref } from 'vue'

import { startupSceneStateKey } from '../../../composables/startup-scene'

const props = defineProps<{
  progress: number
  logoSrc: string
  label: string
  load: (sceneState: Ref<StartupSceneState>) => Promise<void>
  instantExit?: boolean
}>()

const emit = defineEmits<{
  (e: 'hidden'): void
}>()

const phase = ref<'splash' | 'loading' | 'done'>('splash')
const sceneState = ref<StartupSceneState>('pending')
provide(startupSceneStateKey, sceneState)

onMounted(async () => {
  phase.value = 'loading'
  const opening = new Promise<void>(resolve => setTimeout(resolve, 500))

  try {
    await props.load(sceneState)
  }
  finally {
    await opening
    await nextTick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    phase.value = 'done'
  }
})
</script>

<template>
  <slot />
  <StartupScreen
    :phase="phase"
    :progress="progress"
    :instant-exit="instantExit"
    :logo-src="logoSrc"
    :label="label"
    @hidden="emit('hidden')"
  />
</template>
