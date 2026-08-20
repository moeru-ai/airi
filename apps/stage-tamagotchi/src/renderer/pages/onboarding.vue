<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { OnboardingScreen, OnboardingStepAnalyticsNotice } from '@proj-airi/stage-ui/components'
import { isAnalyticsAvailableInBuild } from '@proj-airi/stage-ui/libs/analytics'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

import { electronAuthStartLogin, electronOnboardingClose } from '../../shared/eventa'

const authStore = useAuthStore()
const { needsLogin, isAuthenticated } = storeToRefs(authStore)
const onboardingStore = useOnboardingStore()
const { closeRequestId } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const closeWindow = useElectronEventaInvoke(electronOnboardingClose)
let closing = false

async function closeOnboardingWindow() {
  if (closing)
    return

  closing = true
  try {
    await closeWindow()
  }
  catch (error) {
    closing = false
    console.error('[Onboarding] Failed to close the onboarding window.', error)
  }
}

// The shared action publishes a close request from the renderer that finishes
// authentication. This renderer remains the sole owner of the Electron close
// side effect. The auth check also handles a window mounted after the request.
watch([isAuthenticated, closeRequestId], ([authenticated, requestId], previous) => {
  const previousRequestId = previous?.[1]
  if (authenticated || (previousRequestId !== undefined && requestId !== previousRequestId))
    void closeOnboardingWindow()
}, { immediate: true })

// The onboarding window is a separate Electron process with its own Pinia instance.
// When step-welcome sets needsLogin=true, we must invoke the IPC login from here
// since the controls-island watcher only exists in the main window.
watch(needsLogin, async (val) => {
  if (val && !isAuthenticated.value) {
    await startLogin()
    needsLogin.value = false
    await closeOnboardingWindow()
  }
})

const bgClass = computed(() => isDark.value ? 'bg-[#0f0f0f]' : 'bg-white')
const extraSteps = computed(() => {
  return isAnalyticsAvailableInBuild()
    ? [{ id: 'analytics-notice', component: OnboardingStepAnalyticsNotice }]
    : []
})

async function handleSkipped() {
  onboardingStore.markSetupSkipped()
  await closeOnboardingWindow()
}

async function handleConfigured() {
  onboardingStore.markSetupCompleted()
  await closeOnboardingWindow()
}
</script>

<template>
  <!-- Same flex/min-h-0 chain as OnboardingDialog so model step grid scrolls inside the viewport (not the whole page). -->
  <div
    class="onboarding-root h-full min-h-0 w-full flex flex-col overflow-hidden overscroll-none"
    :class="bgClass"
  >
    <div class="min-h-8 w-full flex-shrink-0 select-none drag-region" :class="bgClass" />
    <div class="mx-8 mb-8 mt-2 min-h-0 flex flex-1 flex-col">
      <OnboardingScreen :extra-steps="extraSteps" @skipped="handleSkipped" @configured="handleConfigured" />
    </div>
  </div>
</template>

<style scoped>
.onboarding-root {
  scrollbar-width: none;
}

.onboarding-root::-webkit-scrollbar {
  display: none;
}
</style>

<route lang="yaml">
meta:
  layout: plain
</route>
