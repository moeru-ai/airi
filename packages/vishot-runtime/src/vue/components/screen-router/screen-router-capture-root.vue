<script setup lang="ts">
import type { ScenarioCaptureRootProps } from '../../../runtime/types'

import { computed, inject, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

import ScenarioCaptureRoot from '../scenario-capture-root.vue'

import { injectSceneRouterStore } from './context'

const props = withDefaults(defineProps<ScenarioCaptureRootProps>(), {
  padding: '0px',
})

const route = useRoute()
const sceneRouterStore = inject(injectSceneRouterStore, null)

function humanizeCaptureRootName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map(token => token[0]?.toUpperCase() + token.slice(1))
    .join(' ')
}

const shouldDisplay = computed(() => {
  if (!sceneRouterStore) {
    return true
  }

  const activeId = sceneRouterStore.activeCaptureRootId.value
  if (!activeId) {
    return true
  }

  return activeId === props.name
})

onMounted(() => {
  if (!sceneRouterStore) {
    return
  }

  sceneRouterStore.registerCaptureRoot({
    id: props.name,
    routePath: route.path,
    title: humanizeCaptureRootName(props.name),
  })
})

onUnmounted(() => {
  if (!sceneRouterStore) {
    return
  }

  sceneRouterStore.unregisterCaptureRoot(route.path, props.name)
})
</script>

<template>
  <ScenarioCaptureRoot v-show="shouldDisplay" :name="props.name" :padding="props.padding">
    <slot />
  </ScenarioCaptureRoot>
</template>
