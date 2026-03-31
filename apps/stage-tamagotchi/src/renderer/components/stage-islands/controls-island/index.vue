<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { useSettings, useSettingsAudioDevice, useSettingsControlsIsland } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import ControlsIslandProfilePicker from './controls-island-profile-picker.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electron,
  electronAppQuit,
  electronOpenChat,
  electronOpenSettings,
  electronStartDraggingWindow,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const settingsControlsIslandStore = useSettingsControlsIsland()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const { autoHideControlsIsland, autoHideDelay, autoShowDelay, autoHideOpacity } = storeToRefs(settingsControlsIslandStore)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
const closeWindow = useElectronEventaInvoke(electronAppQuit)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const expanded = ref(false)
const islandRef = ref<HTMLElement>()

// Tracks open overlays/dialogs that should prevent auto-collapse (e.g. 'hearing', 'profile-picker')
const blockingOverlays = reactive(new Set<string>())
const isBlocked = computed(() => blockingOverlays.size > 0)

function setOverlay(key: string, active: boolean) {
  if (active)
    blockingOverlays.add(key)
  else
    blockingOverlays.delete(key)
}

// Expose for parent (e.g. to disable click-through when a dialog is open)
defineExpose({
  get hearingDialogOpen() { return blockingOverlays.has('hearing') },
  set hearingDialogOpen(v: boolean) { setOverlay('hearing', v) },
})

const { isOutside } = useElectronMouseInElement(islandRef)

// Auto-hide logic with configurable delays
const autoHideDelayMs = computed(() => autoHideDelay.value * 1000)
const autoShowDelayMs = computed(() => autoShowDelay.value * 1000)

// Track time since mouse left/entered
const timeSinceOutside = ref(0)
const timeSinceInside = ref(0)

let lastUpdateTime = Date.now()

// Update time tracking
useIntervalFn(() => {
  const now = Date.now()
  const delta = now - lastUpdateTime
  lastUpdateTime = now

  if (isOutside.value) {
    timeSinceOutside.value += delta
    timeSinceInside.value = 0
  }
  else {
    timeSinceInside.value += delta
    timeSinceOutside.value = 0
  }
}, 100)

// Calculate opacity when hidden (0-100 range converted to 0-1)
const hiddenOpacity = computed(() => autoHideOpacity.value / 100)

// Auto-hide: hide controls island when mouse leaves after delay
// Auto-show: show controls island when mouse enters after delay
const isHidden = computed(() => {
  if (!autoHideControlsIsland.value)
    return false

  // Don't hide if there's a blocking overlay or expanded panel should stay
  if (isBlocked.value || expanded.value)
    return false

  // When mouse is inside, always show immediately (unless show delay is set)
  if (!isOutside.value) {
    if (autoShowDelay.value > 0) {
      // Wait for mouse to be inside for the configured delay before showing
      return timeSinceInside.value < autoShowDelayMs.value
    }
    return false
  }

  // When mouse is outside, hide after delay
  return timeSinceOutside.value >= autoHideDelayMs.value
})

watch(isOutside, (outside) => {
  lastUpdateTime = Date.now()
  timeSinceOutside.value = 0
  timeSinceInside.value = 0

  if (outside && expanded.value && !isBlocked.value) {
    expanded.value = false
  }
})

watch(expanded, (isExpanded) => {
  if (!isExpanded) {
    blockingOverlays.clear()
  }
})

useIntervalFn(() => {
  if (expanded.value && isOutside.value && !isBlocked.value) {
    expanded.value = false
  }
}, () => autoHideDelayMs.value || 5000)

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
}

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

function refreshWindow() {
  window.location.reload()
}
</script>

<template>
  <div
    ref="islandRef"
    fixed bottom-2 right-2
    :style="autoHideControlsIsland ? { opacity: isHidden ? hiddenOpacity : 1 } : {}"
    :class="[
      autoHideControlsIsland ? 'transition-opacity duration-300' : '',
    ]"
  >
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
            <ControlButtonTooltip disable-hoverable-content>
              <ControlButton :button-style="adjustStyleClasses.button" @click="openSettings({ route: '/settings' })">
                <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
              </ControlButton>
              <template #tooltip>
                {{ t('tamagotchi.stage.controls-island.open-settings') }}
              </template>
            </ControlButtonTooltip>

            <ControlButtonTooltip disable-hoverable-content>
              <ControlsIslandProfilePicker placement="up" :open="blockingOverlays.has('profile-picker')" @update:open="setOverlay('profile-picker', $event)">
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

            <ControlButtonTooltip disable-hoverable-content>
              <ControlButton :button-style="adjustStyleClasses.button" @click="refreshWindow">
                <div i-solar:refresh-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
              </ControlButton>
              <template #tooltip>
                {{ t('tamagotchi.stage.controls-island.refresh') }}
              </template>
            </ControlButtonTooltip>

            <ControlButtonTooltip disable-hoverable-content>
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

            <ControlButtonTooltip disable-hoverable-content>
              <ControlButton :button-style="adjustStyleClasses.button" @click="toggleAlwaysOnTop()">
                <div v-if="alwaysOnTop" i-solar:pin-bold :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                <div v-else i-solar:pin-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300 opacity-50" />
              </ControlButton>
              <template #tooltip>
                {{ alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top') }}
              </template>
            </ControlButtonTooltip>

            <ControlsIslandFadeOnHover :icon-class="adjustStyleClasses.icon" :button-style="adjustStyleClasses.button" />

            <ControlButtonTooltip disable-hoverable-content>
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
          <ControlsIslandHearingConfig :show="blockingOverlays.has('hearing')" @update:show="setOverlay('hearing', $event)">
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
