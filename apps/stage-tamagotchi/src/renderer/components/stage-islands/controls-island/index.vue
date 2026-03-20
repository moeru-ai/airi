<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { useCustomVrmAnimationsStore, useModelStore } from '@proj-airi/stage-ui-three'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import ControlsIslandProfilePicker from './controls-island-profile-picker.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electronOpenChat,
  electronOpenSettings,
  electronStartDraggingWindow,
  electronWindowHide,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const modelStore = useModelStore()
const customVrmAnimationsStore = useCustomVrmAnimationsStore()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const cardStore = useAiriCardStore()
const { activeCard, activeCardId } = storeToRefs(cardStore)
const { favoriteExpression, activeExpressions, vrmIdleAnimation } = storeToRefs(modelStore)

// Watch for profile changes to provide feedback
const lastCardId = ref(activeCardId.value)
watch(activeCard, (card) => {
  if (card && activeCardId.value !== lastCardId.value) {
    lastCardId.value = activeCardId.value
    toast.info(`You selected AIRI Card: ${card.name}`, { id: 'transcription-feedback' })
  }
})
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)
const isLinux = ref(false)
const hideWindow = useElectronEventaInvoke(electronWindowHide)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const expanded = ref(false)
const islandRef = ref<HTMLElement>()

// === Sub-menu state ===
const view = ref<'main' | 'emotions'>('main')

// Expose whether hearing dialog is open so parent can disable click-through
const hearingDialogOpen = ref(false)
defineExpose({ hearingDialogOpen, rootElement: islandRef })

const { isOutside } = useElectronMouseInElement(islandRef)

const { start: startCollapseTimer, stop: stopCollapseTimer } = useTimeoutFn(() => {
  if (expanded.value && !hearingDialogOpen.value) {
    expanded.value = false
    view.value = 'main' // Reset sub-menu on collapse
  }
}, 1500)

watch(isOutside, (outside) => {
  if (outside) {
    startCollapseTimer()
  }
  else {
    stopCollapseTimer()
  }
})

watch(expanded, (isExp) => {
  if (!isExp) {
    view.value = 'main' // Reset sub-menu when collapsing
  }
})

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
}

function handleOpenSettings() {
  return openSettings({})
}

function handleOpenChat() {
  return openChat()
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
const startDraggingWindowInvoke = useElectronEventaInvoke(electronStartDraggingWindow, context.value)
function startDraggingWindow() {
  if (!isLinux.value) {
    startDraggingWindowInvoke()
  }
}

async function refreshWindow() {
  // Use store-level applyCardState with force=true to reload model without full page refresh
  if (activeCard.value) {
    await cardStore.activateCard(activeCardId.value, true)
  }
  else {
    window.location.reload()
  }
}

// === Emotions ===
const ACT_EMOTIONS = [
  { key: 'happy', emoji: '😊' },
  { key: 'sad', emoji: '😢' },
  { key: 'angry', emoji: '😠' },
  { key: 'surprised', emoji: '😲' },
  { key: 'neutral', emoji: '😐' },
  { key: 'think', emoji: '🤔' },
  { key: 'cool', emoji: '😎' },
] as const

function triggerEmotion(emotion: string) {
  if (typeof (window as any).testEmotion === 'function') {
    ;(window as any).testEmotion(emotion)
    toast.info(`Triggered ${emotion} expression`, { id: 'transcription-feedback' })
  }
}

function triggerRandomEmotion() {
  const random = ACT_EMOTIONS[Math.floor(Math.random() * ACT_EMOTIONS.length)]
  triggerEmotion(random.key)
}

// === Favorite ===
const hasFavorite = computed(() => !!favoriteExpression.value)
const currentIdleAnimationLabel = computed(() => customVrmAnimationsStore.animationLabelByKey[vrmIdleAnimation.value] ?? vrmIdleAnimation.value)
const isFavoriteActive = computed(() => {
  if (!favoriteExpression.value)
    return false
  return (activeExpressions.value[favoriteExpression.value] || 0) > 0
})

function toggleFavorite() {
  if (!favoriteExpression.value)
    return
  const name = favoriteExpression.value
  const current = activeExpressions.value[name] || 0
  const next = current > 0 ? 0 : 1
  activeExpressions.value = { ...activeExpressions.value, [name]: next }
}

function cycleAnimation() {
  const keys = customVrmAnimationsStore.animationKeys
  const currentIndex = keys.indexOf(vrmIdleAnimation.value)
  const nextIndex = (currentIndex + 1) % keys.length
  const nextAnimation = keys[nextIndex]
  vrmIdleAnimation.value = nextAnimation
  toast.info(`Selected animation: ${customVrmAnimationsStore.animationLabelByKey[nextAnimation] ?? nextAnimation}`, { id: 'transcription-feedback' })
}
</script>

<template>
  <div ref="islandRef" fixed bottom-2 right-2 z-100 select-none>
    <div flex flex-col items-end gap-1>
      <!-- iOS Style Drawer Panel -->
      <Transition
        enter-active-class="transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)"
        leave-active-class="transition-all duration-400 cubic-bezier(0.32, 0.72, 0, 1)"
        enter-from-class="opacity-0 translate-y-8 scale-90 blur-sm"
        leave-to-class="opacity-0 translate-y-8 scale-90 blur-sm"
      >
        <div v-if="expanded" border="1 neutral-200 dark:neutral-800" mb-2 flex flex-col gap-1 rounded-2xl p-2 backdrop-blur-xl :class="['bg-neutral-100/80 shadow-2xl shadow-black/20 dark:bg-neutral-900/80']">
          <!-- Main View -->
          <Transition
            enter-active-class="transition-all duration-300 cubic-bezier(0.32, 0.72, 0, 1)"
            leave-active-class="transition-all duration-200 cubic-bezier(0.32, 0.72, 0, 1)"
            enter-from-class="opacity-0 scale-95"
            leave-to-class="opacity-0 scale-95"
            mode="out-in"
          >
            <div v-if="view === 'main'" key="main" grid grid-cols-3 gap-2>
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="handleOpenSettings">
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
                <ControlButton :button-style="adjustStyleClasses.button" @click="handleOpenChat">
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

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="toggleAlwaysOnTop()">
                  <div v-if="alwaysOnTop" i-solar:pin-bold :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                  <div v-else i-solar:pin-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300 opacity-50" />
                </ControlButton>
                <template #tooltip>
                  {{ alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top') }}
                </template>
              </ControlButtonTooltip>

              <ControlsIslandFadeOnHover :icon-class="adjustStyleClasses.icon" :button-style="adjustStyleClasses.button" />

              <!-- Emotions Button -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'emotions'">
                  <div i-solar:emoji-funny-square-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                </ControlButton>
                <template #tooltip>
                  Emotions
                </template>
              </ControlButtonTooltip>

              <!-- Favorite Button -->
              <ControlButtonTooltip>
                <ControlButton
                  :button-style="adjustStyleClasses.button"
                  :class="isFavoriteActive ? 'ring-2 ring-amber-400/60' : ''"
                  @click="toggleFavorite"
                >
                  <div
                    :class="[
                      adjustStyleClasses.icon,
                      hasFavorite ? 'text-amber-500' : 'text-neutral-400 dark:text-neutral-600',
                      isFavoriteActive ? 'i-solar:star-bold' : 'i-solar:star-linear',
                    ]"
                  />
                </ControlButton>
                <template #tooltip>
                  {{ hasFavorite ? `Favorite: ${favoriteExpression}` : 'No favorite set' }}
                </template>
              </ControlButtonTooltip>

              <!-- Animation Cycle Button -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="cycleAnimation">
                  <div i-solar:running-2-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.cycle-animation') }}: {{ currentIdleAnimationLabel }}
                </template>
              </ControlButtonTooltip>

              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" hover:bg-red-500 hover:text-white @click="hideWindow()">
                  <div i-solar:close-circle-outline :class="adjustStyleClasses.icon" />
                </ControlButton>
                <template #tooltip>
                  {{ t('tamagotchi.stage.controls-island.hide') }}
                </template>
              </ControlButtonTooltip>
            </div>

            <!-- Emotions Sub-menu -->
            <div v-else key="emotions" grid grid-cols-3 gap-2>
              <ControlButtonTooltip v-for="emotion in ACT_EMOTIONS" :key="emotion.key">
                <ControlButton :button-style="adjustStyleClasses.button" @click="triggerEmotion(emotion.key)">
                  <div :class="[adjustStyleClasses.icon, 'flex items-center justify-center text-base leading-none']">
                    {{ emotion.emoji }}
                  </div>
                </ControlButton>
                <template #tooltip>
                  {{ emotion.key }}
                </template>
              </ControlButtonTooltip>

              <!-- Random -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="triggerRandomEmotion">
                  <div i-solar:shuffle-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                </ControlButton>
                <template #tooltip>
                  Random Emotion
                </template>
              </ControlButtonTooltip>

              <!-- Back -->
              <ControlButtonTooltip>
                <ControlButton :button-style="adjustStyleClasses.button" @click="view = 'main'">
                  <div i-solar:arrow-left-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                </ControlButton>
                <template #tooltip>
                  Back
                </template>
              </ControlButtonTooltip>
            </div>
          </Transition>
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
          <ControlButton
            :button-style="adjustStyleClasses.button"
            cursor-move
            @mousedown="startDraggingWindow()"
          >
            <div
              i-ph:arrows-out-cardinal
              :class="[
                adjustStyleClasses.icon,
                useHearingStore().isTranscribing ? 'text-red-500 animate-pulse' : 'text-neutral-800 dark:text-neutral-300',
              ]"
            />
          </ControlButton>
          <template #tooltip>
            {{ useHearingStore().isTranscribing ? 'STT Processing...' : t('tamagotchi.stage.controls-island.drag-to-move-window') }}
          </template>
        </ControlButtonTooltip>
      </div>
    </div>
  </div>
</template>
