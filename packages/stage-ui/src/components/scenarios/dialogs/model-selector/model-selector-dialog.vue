<script setup lang="ts">
import type { DisplayModel } from '../../../../stores/display-models'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTrigger } from 'vaul-vue'
import { onMounted } from 'vue'

import ModelManager from './model-selector.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'

const props = defineProps<{
  selectedModel?: DisplayModel
}>()
const emits = defineEmits<{
  (e: 'pick', value: DisplayModel | undefined): void
}>()
const showDialog = defineModel('show', { type: Boolean, default: false, required: false })
const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogPortal v-if="showDialog">
      <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-5xl w-[92dvw] transform overflow-y-scroll rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <VisuallyHidden>
          <DialogTitle>Models</DialogTitle>
        </VisuallyHidden>
        <ModelManager :selected-model="props.selectedModel" @close="showDialog = false" @pick="value => emits('pick', value)" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerTrigger as-child>
      <slot />
    </DrawerTrigger>
    <DrawerPortal v-if="showDialog">
      <DrawerOverlay class="fixed inset-0" />
      <DrawerContent class="fixed bottom-0 left-0 right-0 z-1000 mt-20 h-full max-h-[80%] flex flex-col rounded-t-2xl bg-neutral-50 px-4 pt-4 outline-none backdrop-blur-md sm:max-h-[75%] dark:bg-neutral-900/95" :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }">
        <DrawerHandle />
        <ModelManager :selected-model="props.selectedModel" @close="showDialog = false" @pick="value => emits('pick', value)" />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
