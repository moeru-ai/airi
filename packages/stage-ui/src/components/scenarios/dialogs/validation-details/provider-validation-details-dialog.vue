<script setup lang="ts">
import type { ProviderValidationStep } from '../../../../libs/providers/validators/run'

import { Button } from '@proj-airi/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { computed, onMounted } from 'vue'

const props = withDefaults(defineProps<{
  steps: ProviderValidationStep[]
  stepId?: string
  title?: string
}>(), {
  title: 'Validation details',
})

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

const failedSteps = computed(() => props.steps.filter(step => step.status === 'invalid'))
const selectedSteps = computed(() => {
  if (!props.stepId)
    return failedSteps.value
  return failedSteps.value.filter(step => step.id === props.stepId)
})
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay :class="['fixed', 'inset-0', 'z-[9999]', 'bg-black/50', 'backdrop-blur-sm', 'data-[state=closed]:animate-fadeOut', 'data-[state=open]:animate-fadeIn']" />
      <DialogContent :class="['fixed', 'left-1/2', 'top-1/2', 'z-[9999]', 'max-h-full', 'max-w-2xl', 'w-[92dvw]', 'transform', 'overflow-y-scroll', 'rounded-2xl', 'bg-white', 'p-6', 'shadow-xl', 'outline-none', 'backdrop-blur-md', 'scrollbar-none', '-translate-x-1/2', '-translate-y-1/2', 'data-[state=closed]:animate-contentHide', 'data-[state=open]:animate-contentShow', 'dark:bg-neutral-900']">
        <div :class="['flex', 'items-center', 'justify-between', 'gap-2', 'mb-4']">
          <DialogTitle :class="['text-lg', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">
            {{ props.title }}
          </DialogTitle>
          <Button size="sm" variant="secondary" @click="() => showDialog = false">
            Close
          </Button>
        </div>
        <div :class="['flex', 'flex-col', 'gap-3']">
          <div v-if="selectedSteps.length === 0" :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
            No failed checks.
          </div>
          <div
            v-for="step in selectedSteps"
            :key="step.id"
            :class="['rounded-lg', 'bg-red-50', 'p-3', 'dark:border-red-800/40', 'dark:bg-red-900/20']"
          >
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:close-circle-line-duotone', 'text-lg', 'text-red-600', 'dark:text-red-500']" />
              <div :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
                {{ step.label }}
              </div>
            </div>
            <div :class="['mt-1', 'text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ step.reason || 'Validation failed.' }}
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay :class="['fixed', 'inset-0']" />
      <DrawerContent
        :class="['fixed', 'bottom-0', 'left-0', 'right-0', 'z-1000', 'mt-20', 'h-full', 'max-h-[70%]', 'flex', 'flex-col', 'rounded-t-2xl', 'bg-neutral-50', 'px-4', 'pt-4', 'outline-none', 'backdrop-blur-md', 'dark:bg-neutral-900/95']"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle />
        <div :class="['flex', 'items-center', 'justify-between', 'gap-2', 'mb-4']">
          <div :class="['text-lg', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">
            {{ props.title }}
          </div>
          <Button size="sm" variant="secondary" @click="() => showDialog = false">
            Close
          </Button>
        </div>
        <div :class="['flex', 'flex-col', 'gap-3', 'overflow-y-auto']">
          <div v-if="selectedSteps.length === 0" :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
            No failed checks.
          </div>
          <div
            v-for="step in selectedSteps"
            :key="step.id"
            :class="['rounded-lg', 'bg-red-50', 'p-3', 'dark:border-red-800/40', 'dark:bg-red-900/20']"
          >
            <div :class="['flex', 'items-center', 'gap-2']">
              <div :class="['i-solar:close-circle-line-duotone', 'text-lg', 'text-red-600', 'dark:text-red-500']" />
              <div :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
                {{ step.label }}
              </div>
            </div>
            <div :class="['mt-1', 'text-xs', 'text-neutral-600', 'dark:text-neutral-300']">
              {{ step.reason || 'Validation failed.' }}
            </div>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
