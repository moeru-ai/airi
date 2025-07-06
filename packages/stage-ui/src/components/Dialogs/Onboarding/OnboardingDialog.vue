<script setup lang="ts">
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from 'reka-ui'

import Onboarding from './Onboarding.vue'

const emit = defineEmits<{
  (e: 'configured'): void
  (e: 'skipped'): void
}>()

const showDialog = defineModel({ type: Boolean, default: false, required: false })
</script>

<template>
  <DialogRoot :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay class="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DialogContent class="data-[state=open]:animate-contentShow data-[state=closed]:animate-contentHide fixed left-1/2 top-1/2 z-[9999] mx-0 max-w-2xl w-[92vw] transform rounded-lg bg-white p-4 shadow-xl backdrop-blur-md md:mx-4 -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-900 md:p-8">
        <Onboarding @configured="emit('configured')" @skipped="emit('skipped')" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
