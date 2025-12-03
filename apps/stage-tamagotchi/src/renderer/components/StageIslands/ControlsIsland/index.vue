<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import ControlButton from './ControlButton.vue'
import ControlButtonTooltip from './ControlButtonTooltip.vue'
import ControlsIslandFadeOnHover from './ControlsIslandFadeOnHover.vue'
import ControlsIslandHearingConfig from './ControlsIslandHearingConfig.vue'
import IndicatorMicVolume from './IndicatorMicVolume.vue'

import { electronOpenChat, electronOpenSettings, electronStartDraggingWindow } from '../../../../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '../../../composables/electron-vueuse/use-electron-eventa-context'
import { isLinux } from '../../../utils/platform'

const { isDark, toggleDark } = useTheme()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)

/**
 * This is a know issue (or expected behavior maybe) to Electron.
 * We don't use this approach on Linux because it's not working.
 *
 * See `apps/stage-tamagotchi/src/main/windows/main/index.ts` for handler definition
 */
const startDraggingWindow = !isLinux ? defineInvoke(context.value, electronStartDraggingWindow) : undefined

// Expose whether hearing dialog is open so parent can disable click-through
const hearingDialogOpen = ref(false)
defineExpose({ hearingDialogOpen })

function refreshWindow() {
  window.location.reload()
}
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
        <ControlButton @click="openChat">
          <div i-solar:chat-line-line-duotone size-5 text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          Open Chat
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton @click="refreshWindow">
          <div i-solar:refresh-linear size-5 text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          Refresh
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlsIslandHearingConfig v-model:show="hearingDialogOpen">
          <div class="relative">
            <ControlButton>
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" size-5 />
                <div v-else i-ph:microphone-slash size-5 text="neutral-800 dark:neutral-300" />
              </Transition>
            </ControlButton>
          </div>
        </ControlsIslandHearingConfig>

        <template #tooltip>
          Open hearing controls
        </template>
      </ControlButtonTooltip>

      <ControlsIslandFadeOnHover />

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
