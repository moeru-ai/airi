<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { OnboardingScreen } from '@proj-airi/stage-ui/components'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'

import {
  electronOnboardingClose,
  electronOnboardingCompleted,
  electronOnboardingSkipped,
} from '../../shared/eventa'

const onboardingStore = useOnboardingStore()

const closeWindow = useElectronEventaInvoke(electronOnboardingClose)
const markCompleted = useElectronEventaInvoke(electronOnboardingCompleted)
const markSkipped = useElectronEventaInvoke(electronOnboardingSkipped)

async function handleSkipped() {
  onboardingStore.markSetupSkipped()
  await markSkipped()
  await closeWindow()
}

async function handleConfigured() {
  onboardingStore.markSetupCompleted()
  await markCompleted()
  await closeWindow()
}
</script>

<template>
  <div class="onboarding-root" h-full w-full flex flex-col overflow-x-hidden overflow-y-auto overscroll-none bg="white dark:#0f0f0f">
    <div bg="white dark:#0f0f0f" w="100dvw" min-h="12" w-full flex-shrink-0 select-none data-tauri-drag-region />
    <div class="onboarding-scroll" w-full flex-1 px-3>
      <div class="onboarding-content" h-full>
        <OnboardingScreen @skipped="handleSkipped" @configured="handleConfigured" />
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
