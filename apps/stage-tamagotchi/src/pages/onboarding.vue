<script setup lang="ts">
import { OnboardingScreen } from '@proj-airi/stage-ui/components'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'

import { useTauriWindow } from '../composables/tauri'

const window = useTauriWindow()
const onboardingStore = useOnboardingStore()

function handleSkipped() {
  window.closeWindow()
}

function handleConfigured() {
  onboardingStore.markSetupCompleted()
  window.closeWindow()
}
</script>

<template>
  <div h-full w-full flex flex-col overflow-x-hidden overflow-y-hidden overscroll-none>
    <div bg="white dark:#181818" w="100dvw" min-h="12" data-tauri-drag-region w-full flex-shrink-0 select-none />
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
