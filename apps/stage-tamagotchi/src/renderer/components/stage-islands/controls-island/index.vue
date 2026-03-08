<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import ControlsIslandProfilePicker from './controls-island-profile-picker.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electron,
  electronOpenChat,
  electronOpenSettings,
  electronStartDraggingWindow,
  electronWindowClose,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { controlsIslandIconSize } = storeToRefs(settingsStore)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
const closeWindow = useElectronEventaInvoke(electronWindowClose)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const expanded = ref(false)
const islandRef = ref<HTMLElement>()

const { isOutside } = useElectronMouseInElement(islandRef)

const { start: startCollapseTimer, stop: stopCollapseTimer } = useTimeoutFn(() => {
  if (expanded.value) {
    expanded.value = false
  }
}, 1500, { immediate: false })

watch(isOutside, (outside) => {
  if (outside && expanded.value) {
    startCollapseTimer()
  }
  else {
    stopCollapseTimer()
  }
})

watch(expanded, (isExp) => {
  if (isExp && isOutside.value) {
    startCollapseTimer()
  }
  else if (!isExp) {
    stopCollapseTimer()
  }
})

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
      // Fixed to large for better visibility in the new layout,
      // can be changed to windowHeight based check if absolutely needed.
      isLarge = true
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
const startDraggingWindow = !isLinux() ? defineInvoke(context.value, electronStartDraggingWindow) : undefined

// Expose whether hearing dialog is open so parent can disable click-through
const hearingDialogOpen = ref(false)
defineExpose({ hearingDialogOpen })

function refreshWindow() {
  window.location.reload()
}
</script>

<template>
  <div ref="islandRef" fixed bottom-2 right-2>
    <div flex flex-col items-end gap-1>
      <!-- iOS Style Drawer Panel -->
      <Transition
        enter-active-class="transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)"
        leave-active-class="transition-all duration-400 cubic-bezier(0.32, 0.72, 0, 1)"
        enter-from-class="opacity-0 translate-y-8 scale-90 blur-sm"
        leave-to-class="opacity-0 translate-y-8 scale-90 blur-sm"
      >
        <div v-if="expanded" border="1 neutral-200 dark:neutral-800" mb-2 flex flex-col gap-1 rounded-2xl p-2 backdrop-blur-xl class="bg-neutral-100/80 shadow-2xl shadow-black/20 dark:bg-neutral-900/80">
          <div grid grid-cols-3 gap-2>
            <ControlButtonTooltip>
              <ControlButton :button-style="adjustStyleClasses.button" @click="openSettings">
                <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
              </ControlButton>
              <template #tooltip>
                {{ t('tamagotchi.stage.controls-island.open-settings') }}
              </template>
            </ControlButtonTooltip>

            <ControlButtonTooltip disable-hoverable-content>
              <ControlsIslandProfilePicker>
                <template #default="{ toggle }">
                  <ControlButton :button-style="adjustStyleClasses.button" @click="toggle">
                    <div i-solar:emoji-funny-square-broken :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                  </ControlButton>
                </template>
              </ControlsIslandProfilePicker>
              <template #tooltip>
                {{ t('tamagotchi.stage.controls-island.switch-profile') }}
              </template>
            </ControlButtonTooltip>

            <ControlButtonTooltip disable-hoverable-content>
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
              <ControlButton :button-style="adjustStyleClasses.button" hover:bg-red-500 hover:text-white @click="closeWindow()">
                <div i-solar:close-circle-outline :class="adjustStyleClasses.icon" />
              </ControlButton>
              <template #tooltip>
                {{ t('tamagotchi.stage.controls-island.close') }}
              </template>
            </ControlButtonTooltip>
          </div>
        </div>
      </Transition>

      <!-- Main Controls -->
      <div flex flex-col gap-1>
        <ControlButtonTooltip side="left">
          <ControlButton :button-style="adjustStyleClasses.button" @click="expanded = !expanded">
            <div

              :class="[adjustStyleClasses.icon, expanded ? 'rotate-180' : 'rotate-0']"

              i-solar:alt-arrow-up-line-duotone scale-110 transition-all duration-300
              text="neutral-800 dark:neutral-300"
            />
          </ControlButton>
          <template #tooltip>
            {{ expanded ? t('tamagotchi.stage.controls-island.collapse') : t('tamagotchi.stage.controls-island.expand') }}
          </template>
        </ControlButtonTooltip>

        <ControlButtonTooltip side="left">
          <ControlButton :button-style="adjustStyleClasses.button" cursor-move :class="{ 'drag-region': isLinux }" @mousedown="startDraggingWindow?.()">
            <div i-ph:arrows-out-cardinal :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
          </ControlButton>
          <template #tooltip>
            {{ t('tamagotchi.stage.controls-island.drag-to-move-window') }}
          </template>
        </ControlButtonTooltip>
      </div>
    </div>
  </div>
</template>
