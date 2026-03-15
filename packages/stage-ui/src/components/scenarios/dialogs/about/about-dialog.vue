<script setup lang="ts">
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-2xl w-[92dvw] transform overflow-y-scroll rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0" />
      <DrawerContent class="fixed bottom-0 left-0 right-0 z-1000 mt-20 h-full max-h-[96%] flex flex-col rounded-t-2xl bg-neutral-50 px-4 pt-4 outline-none backdrop-blur-md dark:bg-neutral-900/95" :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }">
        <DrawerHandle />
        <slot />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
