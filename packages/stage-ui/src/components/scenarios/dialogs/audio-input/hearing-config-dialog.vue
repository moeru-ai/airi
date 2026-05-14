<script setup lang="ts">
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTrigger } from 'vaul-vue'
import { onMounted } from 'vue'

import HearingConfig from './hearing-config.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'

const props = defineProps<{
  overlayDim?: boolean
  overlayBlur?: boolean
  granted?: boolean
  volumeLevel?: number
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
    <DialogPortal>
      <DialogOverlay
        :class="[
          props.overlayDim ? 'bg-black/50' : '',
          props.overlayBlur ? 'backdrop-blur-sm' : '',
        ]"
        class="fixed inset-0 z-[9999] data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn"
      />
      <DialogContent class="fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-5xl w-[92dvw] transform overflow-y-scroll rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <VisuallyHidden>
          <DialogTitle>Hearing Input</DialogTitle>
        </VisuallyHidden>
        <HearingConfig
          :granted="props.granted"
          :volume-level="props.volumeLevel"
        />
        <slot name="extra" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerTrigger as-child>
      <slot />
    </DrawerTrigger>
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0" />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000',
          'mt-20 px-4 pt-4',
          'flex flex-col',
          'h-full max-h-80',
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
        <HearingConfig
          :granted="props.granted"
          :volume-level="props.volumeLevel"
        />
        <slot name="extra" />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
