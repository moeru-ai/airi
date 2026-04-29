<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { injectSceneRouterStore } from './context'

interface RegisteredCaptureRoot {
  id: string
  routePath: string
  title: string
}

const route = useRoute()
const router = useRouter()
const registeredCaptureRoots = ref<RegisteredCaptureRoot[]>([])

const currentRouteCaptureRoots = computed(() => (
  registeredCaptureRoots.value.filter(captureRoot => captureRoot.routePath === route.path)
))

const requestedCaptureRootId = computed(() => {
  const queryCapture = route.query.capture

  if (typeof queryCapture !== 'string' || queryCapture.length === 0) {
    return null
  }

  return queryCapture
})

const activeCaptureRootId = computed(() => {
  const captureRootId = requestedCaptureRootId.value
  if (!captureRootId) {
    return null
  }

  return currentRouteCaptureRoots.value.some(captureRoot => captureRoot.id === captureRootId)
    ? captureRootId
    : null
})

function registerCaptureRoot(captureRoot: RegisteredCaptureRoot): void {
  const existing = registeredCaptureRoots.value.find(item => item.id === captureRoot.id && item.routePath === captureRoot.routePath)
  if (existing) {
    if (existing.title !== captureRoot.title) {
      existing.title = captureRoot.title
    }
    return
  }

  registeredCaptureRoots.value.push(captureRoot)
}

function unregisterCaptureRoot(routePath: string, id: string): void {
  const index = registeredCaptureRoots.value.findIndex(item => item.id === id && item.routePath === routePath)
  if (index === -1) {
    return
  }

  registeredCaptureRoots.value.splice(index, 1)
}

async function navigateToCaptureRoot(id: string): Promise<void> {
  await router.replace({
    query: {
      ...route.query,
      capture: id,
    },
  })
}

provide(injectSceneRouterStore, {
  activeCaptureRootId,
  currentRouteCaptureRoots,
  navigateToCaptureRoot,
  registerCaptureRoot,
  unregisterCaptureRoot,
})
</script>

<template>
  <slot />
</template>
