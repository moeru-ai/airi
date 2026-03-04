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
  <div h-full w-full flex flex-col overflow-x-hidden overflow-y-hidden overscroll-none bg="white dark:#0f0f0f">
    <div bg="white dark:#181818" w="100dvw" min-h="12" w-full flex-shrink-0 select-none data-tauri-drag-region />
    <div w-full flex-1 overflow-y-scroll px-3>
      <div h-full py-3>
        <OnboardingScreen @skipped="handleSkipped" @configured="handleConfigured" />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
