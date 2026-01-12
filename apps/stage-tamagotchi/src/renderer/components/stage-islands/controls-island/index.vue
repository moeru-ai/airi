<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { useWindowSize } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import { electronOpenChat, electronOpenSettings, electronStartDraggingWindow } from '../../../../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '../../../composables/electron-vueuse/use-electron-eventa-context'
import { isLinux } from '../../../utils/platform'

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { controlsIslandIconSize } = storeToRefs(settingsStore)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)

// Responsive icon & button sizing based on window height
const { height: windowHeight } = useWindowSize()
// Constants: assume each icon placeholder occupies 50px and there are 7 buttons
const ICON_PLACEHOLDER_PX = 50
const BUTTON_COUNT = 7
const LARGE_THRESHOLD = ICON_PLACEHOLDER_PX * BUTTON_COUNT

// Grouped classes for icon / border / padding and combined style class
const adjustStyleClasses = computed(() => {
  let isLarge: boolean

  // Determine size based on setting
  switch (controlsIslandIconSize.value) {
    case 'large':
      isLarge = true
      break
    case 'small':
      isLarge = false
      break
    case 'auto':
    default:
      isLarge = windowHeight.value > LARGE_THRESHOLD
      break
  }

  const icon = isLarge ? 'size-5' : 'size-3'
  const border = isLarge ? 'border-2' : 'border-0'
  const padding = isLarge ? 'p-2' : 'p-0.5'
  return { icon, border, padding, button: `${border} ${padding}` }
})

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
        <ControlButton :button-style="adjustStyleClasses.button" @click="openSettings">
          <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.open-settings') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="openChat">
          <div i-solar:chat-line-line-duotone :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.open-chat') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="refreshWindow">
          <div i-solar:refresh-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.refresh') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlsIslandHearingConfig v-model:show="hearingDialogOpen">
          <div class="relative">
            <ControlButton :button-style="adjustStyleClasses.button">
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" :class="adjustStyleClasses.icon" />
                <div v-else i-ph:microphone-slash :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
              </Transition>
            </ControlButton>
          </div>
        </ControlsIslandHearingConfig>

        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.open-hearing-controls') }}
        </template>
      </ControlButtonTooltip>

      <ControlsIslandFadeOnHover :icon-class="adjustStyleClasses.icon" :button-style="adjustStyleClasses.button" />

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" cursor-move :class="{ 'drag-region': isLinux }" @mousedown="startDraggingWindow?.()">
          <div i-ph:arrows-out-cardinal :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
        </ControlButton>

        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.drag-to-move-window') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <!-- Recommended to use `toggleDark()` instead of `toggleDark` -->
        <!-- See: https://vueuse.org/shared/useToggle/#usage -->
        <ControlButton :button-style="adjustStyleClasses.button" @click="toggleDark()">
          <Transition name="fade" mode="out-in">
            <div v-if="isDark" i-solar:moon-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
            <div v-else i-solar:sun-2-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
          </Transition>
        </ControlButton>

        <template #tooltip>
          {{ isDark ? t('tamagotchi.stage.controls-island.switch-to-light-mode') : t('tamagotchi.stage.controls-island.switch-to-dark-mode') }}
        </template>
      </ControlButtonTooltip>
    </div>
  </div>
</template>
