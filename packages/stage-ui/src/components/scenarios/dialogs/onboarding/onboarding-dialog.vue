<script setup lang="ts">
import type { OnboardingStep } from './types'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'

import Onboarding from './onboarding.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'

const props = defineProps<{
  extraSteps?: OnboardingStep[]
}>()

const emit = defineEmits<{
  (e: 'configured'): void
  (e: 'skipped'): void
}>()

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 max-h-full max-w-2xl w-[92dvw] flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <VisuallyHidden>
          <DialogTitle>Onboarding</DialogTitle>
        </VisuallyHidden>
        <div class="min-h-0 min-w-0 w-full flex flex-1 flex-col overflow-hidden">
          <Onboarding :extra-steps="props.extraSteps" @configured="emit('configured')" @skipped="emit('skipped')" />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay
        :class="[
          'fixed inset-0 z-900',
          'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0',
          'bg-black/30 backdrop-blur-sm',
        ]"
      />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000',
          'mt-20 px-4 pt-4',
          'flex flex-col',
          'h-full max-h-[90%]',
          'rounded-t-[32px] outline-none backdrop-blur-md',
          'bg-neutral-50/85 dark:bg-neutral-900/90',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle
          :class="[
            '[div&]:bg-neutral-400 [div&]:dark:bg-neutral-600',
          ]"
        />
        <div class="min-h-0 min-w-0 w-full flex flex-1 flex-col overflow-hidden">
          <Onboarding :extra-steps="props.extraSteps" @configured="emit('configured')" @skipped="emit('skipped')" />
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
