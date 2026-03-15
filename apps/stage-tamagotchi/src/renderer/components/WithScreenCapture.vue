<script setup lang="ts">
import type { SourcesOptions } from 'electron'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { Button } from '@proj-airi/ui'
import { useWindowFocus } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { onMounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  sourcesOptions: SourcesOptions
}>()

const sourcesOptions = toRef(props, 'sourcesOptions')

const hasPermissions = ref(false)
const showDialog = ref(false)

const { t } = useI18n()
const {
  getSources,
  setSource,
  selectWithSource,
  checkMacOSPermission,
  requestMacOSPermission,
} = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)
const focused = useWindowFocus()

async function checkPermissions() {
  if (window.platform === 'darwin') {
    const status = await checkMacOSPermission()
    hasPermissions.value = status === 'granted'
  }
  else {
    hasPermissions.value = true
  }
  if (!hasPermissions.value) {
    showDialog.value = true
  }
}

async function requestPermission() {
  if (window.platform === 'darwin') {
    await requestMacOSPermission()
  }
}

onMounted(async () => {
  await checkPermissions()
})

watch(focused, async (isFocused) => {
  if (isFocused) {
    await checkPermissions()
  }
})
</script>

<template>
  <slot
    v-bind="{
      getSources,
      setSource,
      selectWithSource,
      hasPermissions,
      checkPermissions,
      requestPermission,
    }"
  />

  <DialogRoot :open="showDialog">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent flex="~ col items-start gap-4" class="fixed left-1/2 top-1/2 z-9999 max-h-full max-w-2xl w-[92dvw] transform overflow-y-scroll rounded-2xl bg-white p-6 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900">
        <DialogTitle class="m-0 text-lg font-semibold">
          {{ t('tamagotchi.settings.screen-capture.permissions-prompt.title') }}
        </DialogTitle>

        <DialogDescription>
          {{ t('tamagotchi.settings.screen-capture.permissions-prompt.description') }}

          <ol mt-4 list-decimal pl-5 text-sm>
            <li mb-1>
              {{ t('tamagotchi.settings.screen-capture.permissions-prompt.instructions.step-1') }}
            </li>
            <li>
              {{ t('tamagotchi.settings.screen-capture.permissions-prompt.instructions.step-2') }}
              <br>
              <span class="text-neutral-500">
                {{ t('tamagotchi.settings.screen-capture.permissions-prompt.instructions.step-2-note') }}
              </span>
            </li>
          </ol>
        </DialogDescription>

        <div flex="~ row gap-2 mt-4 justify-end" w-full>
          <Button
            variant="secondary"
            @click="showDialog = false"
          >
            {{ t('tamagotchi.settings.screen-capture.permissions-prompt.dismiss') }}
          </Button>
          <Button @click="requestMacOSPermission()">
            {{ t('tamagotchi.settings.screen-capture.permissions-prompt.open-preferences') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
