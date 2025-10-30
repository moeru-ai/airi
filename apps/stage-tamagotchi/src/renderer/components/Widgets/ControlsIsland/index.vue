<script setup lang="ts">
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { useDark, useToggle } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import HearingPermissionStatus from '../../../components/HearingPermissionStatus.vue'
import ControlButton from './ControlButton.vue'
import ControlButtonTooltip from './ControlButtonTooltip.vue'
import IndicatorMicVolume from './IndicatorMicVolume.vue'

import { electronOpenSettings, electronStartDraggingWindow } from '../../../../shared/eventa'
import { isLinux } from '../../../utils/platform'

const isDark = useDark({ disableTransition: false })
const toggleDark = useToggle(isDark)

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { enabled: isAudioEnabled } = storeToRefs(settingsAudioDeviceStore)

const { context } = createContext(window.electron.ipcRenderer)
const openSettings = defineInvoke(context, electronOpenSettings)

/**
 * This is a know issue (or expected behavior maybe) to Electron.
 * We don't use this approach on Linux because it's not working.
 *
 * See `apps/stage-tamagotchi/src/main/windows/main/index.ts` for handler definition
 */
const startDraggingWindow = !isLinux ? defineInvoke(context, electronStartDraggingWindow) : undefined

// Expose whether hearing dialog is open so parent can disable click-through
const hearingDialogOpen = ref(false)
defineExpose({ hearingDialogOpen })
</script>

<template>
  <div fixed bottom-2 right-2>
    <div flex flex-col gap-1>
      <ControlButtonTooltip>
        <ControlButton @click="openSettings">
          <div i-solar:settings-minimalistic-outline size-5 text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          Open settings
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <HearingConfigDialog v-model:show="hearingDialogOpen">
          <div class="relative">
            <ControlButton>
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="isAudioEnabled" size-5 />
                <div v-else i-ph:microphone-slash size-5 text="neutral-800 dark:neutral-300" />
              </Transition>
            </ControlButton>
          </div>
          <template #extra>
            <HearingPermissionStatus />
          </template>
        </HearingConfigDialog>

        <template #tooltip>
          Open hearing controls
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton cursor-move :class="{ 'drag-region': isLinux }" @mousedown="startDraggingWindow?.()">
          <div i-ph:arrows-out-cardinal size-5 text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          Drag to move window
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <!-- Recommended to use `toggleDark()` instead of `toggleDark` -->
        <!-- See: https://vueuse.org/shared/useToggle/#usage -->
        <ControlButton @click="toggleDark()">
          <Transition name="fade" mode="out-in">
            <div v-if="isDark" i-solar:moon-outline size-5 text="neutral-800 dark:neutral-300" />
            <div v-else i-solar:sun-2-outline size-5 text="neutral-800 dark:neutral-300" />
          </Transition>
        </ControlButton>

        <template #tooltip>
          {{ isDark ? 'Switch to light mode' : 'Switch to dark mode' }}
        </template>
      </ControlButtonTooltip>
    </div>
  </div>
</template>
