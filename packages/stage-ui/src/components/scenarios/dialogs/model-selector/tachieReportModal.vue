<script setup lang="ts">
import type { TachieValidationReport } from '@proj-airi/stage-ui-tachie'

import { Button } from '@proj-airi/ui'
import { useMediaQuery, useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { onMounted } from 'vue'

defineProps<{
  report: TachieValidationReport | null
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

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
          <div
            :class="[
              'flex items-center gap-3 rounded-lg p-4 font-bold',
              report.status === 'VALID' ? 'bg-green-100/50 text-green-700 dark:bg-green-900/30 dark:text-green-400' : '',
              report.status === 'WARNING' ? 'bg-yellow-100/50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : '',
              report.status === 'INVALID' ? 'bg-red-100/50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : '',
            ]"
          >
            <div v-if="report.status === 'VALID'" i-solar:check-circle-bold-duotone text-2xl />
            <div v-else-if="report.status === 'WARNING'" i-solar:danger-bold-duotone text-2xl />
            <div v-else i-solar:close-circle-bold-duotone text-2xl />
            <div :class="['flex flex-col']">
              <span>Status: {{ report.status }}</span>
              <span class="text-xs opacity-80">{{ report.fileName }}</span>
            </div>
          </div>

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

          <div v-if="report.errors.length > 0" :class="['flex flex-col gap-1']">
            <div class="flex items-center gap-1 text-red-600 font-bold dark:text-red-400">
              <div i-solar:bug-bold-duotone />
              Critical Issues
            </div>
            <ul :class="['list-none p-0', 'flex flex-col gap-1']">
              <li
                v-for="error in report.errors"
                :key="error"
                class="rounded bg-red-50/50 p-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"
              >
                {{ error }}
              </li>
            </ul>
          </div>

          <div v-if="report.warnings.length > 0" :class="['flex flex-col gap-1']">
            <div class="flex items-center gap-1 text-yellow-600 font-bold dark:text-yellow-400">
              <div i-solar:danger-bold-duotone />
              Warnings
            </div>
            <ul :class="['list-none p-0', 'flex flex-col gap-1']">
              <li
                v-for="warning in report.warnings"
                :key="warning"
                class="rounded bg-yellow-50/50 p-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
              >
                {{ warning }}
              </li>
            </ul>
          </div>

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
          <div
            :class="[
              'rounded-lg p-4 font-bold',
              report.status === 'VALID' ? 'bg-green-100/50 text-green-700 dark:bg-green-900/30' : '',
              report.status === 'WARNING' ? 'bg-yellow-100/50 text-yellow-700 dark:bg-yellow-900/30' : '',
              report.status === 'INVALID' ? 'bg-red-100/50 text-red-700 dark:bg-red-900/30' : '',
            ]"
          >
            {{ report.status }}: {{ report.fileName }}
          </div>
          <ul v-if="report.errors.length > 0" :class="['list-none p-0', 'flex flex-col gap-1']">
            <li
              v-for="error in report.errors"
              :key="error"
              class="rounded bg-red-50/50 p-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              {{ error }}
            </li>
          </ul>
          <ul v-if="report.warnings.length > 0" :class="['list-none p-0', 'flex flex-col gap-1']">
            <li
              v-for="warning in report.warnings"
              :key="warning"
              class="rounded bg-yellow-50/50 p-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
            >
              {{ warning }}
            </li>
          </ul>
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
