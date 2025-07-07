<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'

import MobileOnboarding from './MobileOnboarding.vue'
import Onboarding from './Onboarding.vue'

const emit = defineEmits<{
  (e: 'configured'): void
  (e: 'skipped'): void
}>()

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const isDesktop = useMediaQuery('(min-width: 768px)')
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay class="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DialogContent class="data-[state=open]:animate-contentShow data-[state=closed]:animate-contentHide fixed left-1/2 top-1/2 z-[9999] mx-0 my-4 max-h-[calc(100%-4rem)] max-w-2xl w-[92vw] transform overflow-y-scroll rounded-lg bg-white p-4 shadow-xl backdrop-blur-md scrollbar-none md:mx-4 -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-900 md:p-8">
        <Onboarding @configured="emit('configured')" @skipped="emit('skipped')" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 bg-black/40" />
      <DrawerContent class="fixed bottom-0 left-0 right-0 z-1000 mt-20 h-full max-h-[96%] flex flex-col rounded-t-[10px] bg-neutral-50 outline-none backdrop-blur-md dark:bg-neutral-900/95">
        <div class="flex-1 rounded-t-[10px] px-4 py-1">
          <DrawerHandle class="my-2" />
          <MobileOnboarding @configured="emit('configured')" @skipped="emit('skipped')" />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
