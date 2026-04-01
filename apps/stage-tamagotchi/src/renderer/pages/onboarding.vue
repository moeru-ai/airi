<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { OnboardingScreen, OnboardingStepAnalyticsNotice } from '@proj-airi/stage-ui/components'
import { isPosthogAvailableInBuild } from '@proj-airi/stage-ui/stores/analytics'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

import { electronAuthStartLogin, electronOnboardingClose } from '../../shared/eventa'

const authStore = useAuthStore()
const { needsLogin, isAuthenticated } = storeToRefs(authStore)
const onboardingStore = useOnboardingStore()
const { isDark } = useTheme()
const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const closeWindow = useElectronEventaInvoke(electronOnboardingClose)

// The onboarding window is a separate Electron process with its own Pinia instance.
// When step-welcome sets needsLogin=true, we must invoke the IPC login from here
// since the controls-island watcher only exists in the main window.
watch(needsLogin, async (val) => {
  if (val && !isAuthenticated.value) {
    await startLogin()
    needsLogin.value = false
    await closeWindow()
  }
})

const bgClass = computed(() => isDark.value ? 'bg-[#0f0f0f]' : 'bg-white')
const extraSteps = computed(() => {
  return isPosthogAvailableInBuild()
    ? [{ id: 'analytics-notice', component: OnboardingStepAnalyticsNotice }]
    : []
})

async function handleSkipped() {
  onboardingStore.markSetupSkipped()
  await closeWindow()
}

async function handleConfigured() {
  onboardingStore.markSetupCompleted()
  await closeWindow()
}
</script>

<template>
  <div class="onboarding-root" h-full w-full flex flex-col overflow-x-hidden overflow-y-auto overscroll-none :class="bgClass">
    <div :class="bgClass" w="100dvw" min-h="12" w-full flex-shrink-0 select-none />
    <div class="onboarding-scroll" w-full flex-1 px-3>
      <div class="onboarding-content" h-full>
        <OnboardingScreen :extra-steps="extraSteps" @skipped="handleSkipped" @configured="handleConfigured" />
      </div>
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

.onboarding-content {
  padding: 8px 0 20px 0;
}

.onboarding-scroll {
  padding-top: 8px;
  padding-bottom: 20px;
  overflow-y: auto;
}
</style>

<route lang="yaml">
meta:
  layout: plain
</route>
