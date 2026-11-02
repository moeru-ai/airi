<script setup lang="ts">
import type { TachieValidationReport } from '@proj-airi/stage-ui-tachie'
import type { AlertTone } from '@proj-airi/ui'

import { Alert, Button } from '@proj-airi/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  report: TachieValidationReport | null
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const { t } = useI18n()

const statusTones: Record<TachieValidationReport['status'], AlertTone> = {
  VALID: 'success',
  WARNING: 'warning',
  INVALID: 'danger',
}
const statusTone = computed(() => props.report ? statusTones[props.report.status] : 'info')

const open = defineModel<boolean>('open', { default: false })
const isDesktop = useMediaQuery('(min-width: 768px)')
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

function close() {
  emit('close')
  open.value = false
}

function confirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="open" @update:open="value => open = value">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999]',
          'bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-[9999]',
          'max-h-full max-w-xl w-[92dvw] overflow-y-auto',
          'rounded-2xl bg-white p-6 shadow-xl outline-none dark:bg-neutral-900',
          '-translate-x-1/2 -translate-y-1/2',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
      >
        <div :class="['mb-4', 'flex items-center justify-between gap-2']">
          <DialogTitle class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Tachie Model Audit Report
          </DialogTitle>
          <Button size="sm" @click="close">
            Close
          </Button>
        </div>

        <div v-if="report" :class="['flex flex-col gap-4']">
          <Alert :tone="statusTone" :title="t('settings.tachie.audit-report.status', { status: report.status })">
            {{ report.fileName }}
          </Alert>

          <div :class="['grid grid-cols-2 gap-2', 'rounded bg-neutral-100/50 p-2 text-sm dark:bg-neutral-800/50']">
            <div>
              Emotions: <span class="font-mono">{{ report.detected.length }}</span>
            </div>
            <div>
              Canvas:
              <span class="font-mono">
                {{ report.canvas ? `${report.canvas.width}×${report.canvas.height}` : 'Unavailable' }}
              </span>
            </div>
            <div class="col-span-2">
              Detected:
              <span class="font-mono">{{ report.detected.map(entry => entry.emotion).join(', ') || 'None' }}</span>
            </div>
          </div>

          <Alert v-if="report.errors.length > 0" tone="danger" :title="t('settings.tachie.audit-report.critical-issues')">
            <ul>
              <li v-for="error in report.errors" :key="error">
                {{ error }}
              </li>
            </ul>
          </Alert>

          <Alert v-if="report.warnings.length > 0" tone="warning" :title="t('settings.tachie.audit-report.warnings')">
            <ul>
              <li v-for="warning in report.warnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
          </Alert>

          <div v-if="report.ignoredEntries.length > 0" class="text-xs text-neutral-500 dark:text-neutral-400">
            Ignored: {{ report.ignoredEntries.join(', ') }}
          </div>

          <div :class="['mt-2', 'flex justify-end gap-2']">
            <Button @click="close">
              Cancel
            </Button>
            <Button v-if="report.status !== 'INVALID'" @click="confirm">
              {{ report.status === 'WARNING' ? 'Import Anyway' : 'Confirm Import' }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DrawerRoot v-else :open="open" should-scale-background @update:open="value => open = value">
    <DrawerPortal>
      <DrawerOverlay class="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-[9999]',
          'h-full max-h-[85%] flex flex-col',
          'rounded-t-2xl bg-neutral-50 px-4 pt-4 outline-none dark:bg-neutral-900/95',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle />
        <div :class="['mb-4', 'flex items-center justify-between gap-2']">
          <div class="text-lg text-neutral-900 font-semibold dark:text-neutral-100">
            Tachie Model Audit Report
          </div>
          <Button size="sm" @click="close">
            Close
          </Button>
        </div>

        <div v-if="report" :class="['flex flex-1 flex-col gap-4 overflow-y-auto pb-4']">
          <Alert :tone="statusTone" :title="t('settings.tachie.audit-report.status', { status: report.status })">
            {{ report.fileName }}
          </Alert>
          <Alert v-if="report.errors.length > 0" tone="danger" :title="t('settings.tachie.audit-report.critical-issues')">
            <ul>
              <li v-for="error in report.errors" :key="error">
                {{ error }}
              </li>
            </ul>
          </Alert>
          <Alert v-if="report.warnings.length > 0" tone="warning" :title="t('settings.tachie.audit-report.warnings')">
            <ul>
              <li v-for="warning in report.warnings" :key="warning">
                {{ warning }}
              </li>
            </ul>
          </Alert>
          <div :class="['mt-auto', 'flex flex-col gap-2 pt-4']">
            <Button v-if="report.status !== 'INVALID'" @click="confirm">
              {{ report.status === 'WARNING' ? 'Import Anyway' : 'Confirm Import' }}
            </Button>
            <Button @click="close">
              Cancel
            </Button>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
