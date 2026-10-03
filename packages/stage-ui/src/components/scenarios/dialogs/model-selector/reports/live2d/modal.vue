<script setup lang="ts">
import type { Live2DValidationReport } from '@proj-airi/stage-ui-live2d'

import { Button } from '@proj-airi/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import ReportContent from './content.vue'

defineProps<{
  report: Live2DValidationReport | null
}>()

const emits = defineEmits<{
  (event: 'close'): void
  (event: 'confirm'): void
}>()

const showDialog = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

function handleConfirm() {
  emits('confirm')
  showDialog.value = false
}

function handleClose() {
  emits('close')
  showDialog.value = false
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] max-h-[88dvh] max-w-2xl w-[92dvw] -translate-x-1/2 -translate-y-1/2',
          'flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl outline-none dark:bg-neutral-900',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <DialogTitle class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
              {{ t('settings.model-select.live2d-report.title') }}
            </DialogTitle>
            <DialogDescription class="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.description') }}
            </DialogDescription>
          </div>
          <Button size="sm" @click="handleClose">
            {{ t('settings.model-select.live2d-report.close') }}
          </Button>
        </div>

        <ReportContent
          v-if="report"
          :report="report"
          @close="handleClose"
          @confirm="handleConfirm"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-[9999] mt-20 max-h-[90%]',
          'flex flex-col rounded-t-2xl bg-neutral-50 px-4 pt-4 outline-none dark:bg-neutral-900/95',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle />
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <div class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
              {{ t('settings.model-select.live2d-report.title') }}
            </div>
            <div class="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              {{ t('settings.model-select.live2d-report.description-short') }}
            </div>
          </div>
          <Button size="sm" @click="handleClose">
            {{ t('settings.model-select.live2d-report.close') }}
          </Button>
        </div>

        <ReportContent
          v-if="report"
          :report="report"
          @close="handleClose"
          @confirm="handleConfirm"
        />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
