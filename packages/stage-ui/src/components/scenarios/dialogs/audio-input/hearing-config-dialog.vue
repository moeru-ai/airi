<script setup lang="ts">
import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle, DrawerTrigger } from 'vaul-vue'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import HearingConfig from './hearing-config.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'

const props = defineProps<{
  overlayDim?: boolean
  overlayBlur?: boolean
  /** Runs only when the user turns the microphone on in this dialog. */
  beforeEnable?: () => Promise<void>
}>()

/** Opening the dialog does not request microphone permission. Only the microphone switch inside it does. */
const showDialog = defineModel('show', { type: Boolean, default: false, required: false })

const { t } = useI18n()
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
          'fixed inset-0 z-[9999]',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
          props.overlayDim ? 'bg-black/50' : '',
          props.overlayBlur ? 'backdrop-blur-sm' : '',
        ]"
      />
      <!-- The dialog keeps a readable width and scrolls inside small windows, so every control stays reachable. -->
      <DialogContent
        data-testid="hearing-config-dialog"
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] -translate-x-1/2 -translate-y-1/2',
          'max-h-[calc(100dvh-2rem)] max-w-lg w-[calc(100dvw-2rem)] overflow-y-auto',
          'rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md dark:bg-neutral-900',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
      >
        <VisuallyHidden>
          <DialogTitle>{{ t('settings.pages.modules.hearing.title') }}</DialogTitle>
        </VisuallyHidden>
        <HearingConfig :before-enable="props.beforeEnable" />
        <slot name="extra" />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerTrigger as-child>
      <slot />
    </DrawerTrigger>
    <DrawerPortal>
      <DrawerOverlay :class="['fixed inset-0']" />
      <DrawerContent
        data-testid="hearing-config-drawer"
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000',
          'mt-20 px-4 pt-4',
          'flex flex-col',
          'max-h-[min(85dvh,36rem)] overflow-y-auto',
          'rounded-t-[32px] outline-none backdrop-blur-md',
          'bg-neutral-50/85 dark:bg-neutral-900/90',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <VisuallyHidden>
          <DrawerTitle>{{ t('settings.pages.modules.hearing.title') }}</DrawerTitle>
        </VisuallyHidden>
        <DrawerHandle
          :class="[
            '[div&]:bg-neutral-400 [div&]:dark:bg-neutral-600',
          ]"
        />
        <HearingConfig :before-enable="props.beforeEnable" />
        <slot name="extra" />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
