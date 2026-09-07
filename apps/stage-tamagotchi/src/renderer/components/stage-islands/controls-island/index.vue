<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { IS_DEV } from '@proj-airi/stage-shared'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { ScrollableArea, useTheme } from '@proj-airi/ui'
import { refDebounced, useElementSize, useIntervalFn, useMousePressed, useResizeObserver } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusIsland from '../status-island/index.vue'
import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandAuthButton from './controls-island-auth-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandHearingConfig from './controls-island-hearing-config.vue'
import ControlsIslandProfilePicker from './controls-island-profile-picker.vue'
import ControlsIslandStopSpeaking from './controls-island-stop-speaking.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electron,
  electronAppQuit,
  electronCenterMainWindow,
  electronOpenChat,
  electronOpenSettings,
  electronStartDraggingWindow,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'
import { useControlsIslandPlacement } from './use-controls-island-placement'

interface Emits {
  /** Reports whether an active interaction must delay placement changes. */
  interactionChange: [active: boolean]
}

const emit = defineEmits<Emits>()

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()
const { dock, isLeft, isTop, motionPhase } = useControlsIslandPlacement()

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const context = useElectronEventaContext()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const openChat = useElectronEventaInvoke(electronOpenChat)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
const quitApp = useElectronEventaInvoke(electronAppQuit)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)
const centerMainWindow = useElectronEventaInvoke(electronCenterMainWindow)

const expanded = ref(false)
const islandElement = useTemplateRef<HTMLElement>('island')
const islandScrollArea = useTemplateRef<InstanceType<typeof ScrollableArea>>('islandScrollArea')
const islandViewport = computed(() => islandScrollArea.value?.viewport)
const islandContent = useTemplateRef<HTMLElement>('islandContent')
const mainControlsElement = useTemplateRef<HTMLElement>('mainControls')
const { height: mainControlsHeight } = useElementSize(mainControlsElement)
// This probe measures the CSS viewport limit, including the current rem size.
// It stays outside layout and hit testing when the Island changes corners.
const availableSpaceElement = useTemplateRef<HTMLElement>('availableSpace')
const { height: availableHeight } = useElementSize(availableSpaceElement)

// Only one viewport owns vertical scrolling. Main controls keep their natural
// height, including development buttons, while the menu receives the remainder.
const scrollWholeIsland = computed(() => mainControlsHeight.value >= availableHeight.value)
const panelMaxHeight = computed(() => scrollWholeIsland.value
  ? 'none'
  : `${Math.max(0, availableHeight.value - mainControlsHeight.value)}px`)

// Tracks open overlays/dialogs that should prevent auto-collapse (e.g. 'hearing', 'profile-picker')
const blockingOverlays = reactive(new Set<string>())
// A scrollbar drag can leave the visible boundary before the user releases it.
const { pressed } = useMousePressed({ target: islandElement })
const isBlocked = computed(() => blockingOverlays.size > 0 || pressed.value)

// Right-docked content must start at the right edge when its natural width is
// wider than the viewport. Reapply this after resize and after the menu opens.
function alignScrollPosition() {
  const viewport = islandViewport.value
  if (!viewport)
    return

  viewport.scrollTop = isTop.value ? 0 : Math.max(0, viewport.scrollHeight - viewport.clientHeight)

  if (isLeft.value) {
    viewport.scrollLeft = 0
    return
  }

  viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
}

useResizeObserver(islandViewport, alignScrollPosition)
useResizeObserver(islandContent, alignScrollPosition)
watch([dock, expanded, controlsIslandIconSize], async () => {
  await nextTick()
  alignScrollPosition()
}, { flush: 'post' })

function setOverlay(key: string, active: boolean) {
  if (active) {
    blockingOverlays.add(key)
    return
  }

  blockingOverlays.delete(key)
}

// The stage page observes this element for cursor hit testing.
defineExpose({
  get element() { return islandElement.value },
  get hearingDialogOpen() { return blockingOverlays.has('hearing') },
  set hearingDialogOpen(v: boolean) { setOverlay('hearing', v) },
})

const { isOutside } = useElectronMouseInElement(islandElement)
const isOutsideAfter2seconds = refDebounced(isOutside, 1500)

watch(isOutsideAfter2seconds, (outside) => {
  if (outside && expanded.value && !isBlocked.value) {
    expanded.value = false
  }
})

watch(expanded, (isExpanded) => {
  if (!isExpanded) {
    blockingOverlays.clear()
  }
})

watch([expanded, isBlocked], ([isExpanded, isInteractionBlocked]) => {
  emit('interactionChange', isExpanded || isInteractionBlocked)
}, { immediate: true })

useIntervalFn(() => {
  if (expanded.value && isOutside.value && !isBlocked.value) {
    expanded.value = false
  }
}, 1500)

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
}

function toggleControls() {
  expanded.value = !expanded.value
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

const islandPositionClasses = computed(() => [
  isTop.value ? 'top-2' : 'bottom-2',
  isLeft.value ? 'left-2' : 'right-2',
])
const islandMotionClasses = computed(() => {
  const isHidden = motionPhase.value === 'leaving' || motionPhase.value === 'entering'

  return [
    motionPhase.value === 'entering'
      ? 'transition-none'
      : 'transition-[opacity,transform] duration-200 ease-out',
    motionPhase.value === 'idle' ? '' : 'will-change-[opacity,transform] pointer-events-none',
    isHidden ? 'opacity-0 scale-95' : 'opacity-100 scale-100',
    isHidden && isLeft.value ? '-translate-x-3' : '',
    isHidden && !isLeft.value ? 'translate-x-3' : '',
    isHidden && isTop.value ? '-translate-y-2' : '',
    isHidden && !isTop.value ? 'translate-y-2' : '',
  ]
})
const islandLayoutClasses = computed(() => [
  isTop.value ? 'flex-col-reverse' : 'flex-col',
  isLeft.value ? 'items-start' : 'items-end',
])
const mainControlsLayoutClasses = computed(() => [
  'flex gap-1',
  isTop.value ? 'flex-col-reverse' : 'flex-col',
])
const panelPositionClasses = computed(() => {
  if (dock.value === 'top-left')
    return ['origin-top-left']
  if (dock.value === 'top-right')
    return ['origin-top-right']
  if (dock.value === 'bottom-left')
    return ['origin-bottom-left']

  return ['origin-bottom-right']
})
const panelHiddenTransformClass = computed(() => isTop.value ? '-translate-y-8' : 'translate-y-8')

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

/**
 * Requests the main process to move the AIRI desktop window back to screen center.
 */
function resetMainWindowPosition() {
  centerMainWindow().catch(console.error)
}
</script>

<template>
  <div
    ref="island"
    data-testid="controls-island"
    :class="[
      'fixed max-h-[calc(100dvh-1rem)] max-w-[calc(100dvw-1rem)]',
      islandPositionClasses,
      islandMotionClasses,
    ]"
  >
    <div
      ref="availableSpace"
      aria-hidden="true"
      :class="['pointer-events-none invisible absolute h-[calc(100dvh-1rem)] w-0']"
    />
    <ScrollableArea
      ref="islandScrollArea"
      :orientation="scrollWholeIsland ? 'both' : 'horizontal'"
      :class="['max-h-[inherit] max-w-[inherit]']"
      viewport-class="overscroll-contain"
    >
      <div ref="islandContent" :class="['min-w-max flex', islandLayoutClasses]">
        <!-- iOS Style Drawer Panel -->
        <Transition
          enter-active-class="transition-all duration-500 cubic-bezier(0.32, 0.72, 0, 1)"
          leave-active-class="transition-all duration-400 cubic-bezier(0.32, 0.72, 0, 1)"
          :enter-from-class="`opacity-0 ${panelHiddenTransformClass} scale-90 blur-sm`"
          :leave-to-class="`opacity-0 ${panelHiddenTransformClass} scale-90 blur-sm`"
        >
          <ScrollableArea
            v-if="expanded"
            data-testid="controls-menu"
            :orientation="scrollWholeIsland ? 'horizontal' : 'vertical'"
            :style="{ maxHeight: panelMaxHeight }"
            :class="['w-max shrink-0', panelPositionClasses]"
            viewport-class="overscroll-contain"
          >
            <div :class="[isTop ? 'pt-3' : 'pb-3']">
              <div
                :class="[
                  'w-max flex flex-col gap-1 rounded-2xl border border-neutral-200 p-2 dark:border-neutral-800',
                  'bg-neutral-100/80 shadow-2xl shadow-black/20 backdrop-blur-xl dark:bg-neutral-900/80',
                ]"
              >
                <ControlsIslandAuthButton
                  :button-style="adjustStyleClasses.button"
                  :icon-class="adjustStyleClasses.icon"
                />

                <div grid grid-cols-3 gap-2>
                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlButton
                      v-track-button="{ name: 'controls_island_action', action: 'toggle_settings' }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="t('tamagotchi.stage.controls-island.open-settings')"
                      @click="openSettings({ route: '/settings' })"
                    >
                      <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                    </ControlButton>
                    <template #tooltip>
                      {{ t('tamagotchi.stage.controls-island.open-settings') }}
                    </template>
                  </ControlButtonTooltip>

                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlsIslandProfilePicker :open="blockingOverlays.has('profile-picker')" @update:open="setOverlay('profile-picker', $event)">
                      <template #default="{ toggle }">
                        <ControlButton
                          v-track-button="{ name: 'controls_island_action', action: 'toggle_profile_picker' }"
                          :button-style="adjustStyleClasses.button"
                          :aria-label="t('tamagotchi.stage.controls-island.switch-profile')"
                          @click="toggle"
                        >
                          <div i-solar:emoji-funny-square-broken :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                        </ControlButton>
                      </template>
                    </ControlsIslandProfilePicker>
                    <template #tooltip>
                      {{ t('tamagotchi.stage.controls-island.switch-profile') }}
                    </template>
                  </ControlButtonTooltip>

                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlButton
                      v-track-button="{ name: 'controls_island_action', action: 'refresh_window' }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="t('tamagotchi.stage.controls-island.refresh')"
                      @click="refreshWindow"
                    >
                      <div i-solar:refresh-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                    </ControlButton>
                    <template #tooltip>
                      {{ t('tamagotchi.stage.controls-island.refresh') }}
                    </template>
                  </ControlButtonTooltip>

                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlButton
                      v-track-button="{ name: 'controls_island_action', action: 'center_main_window' }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="t('tamagotchi.stage.controls-island.center-main-window')"
                      @click="resetMainWindowPosition"
                    >
                      <div i-solar:target-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                    </ControlButton>
                    <template #tooltip>
                      {{ t('tamagotchi.stage.controls-island.center-main-window') }}
                    </template>
                  </ControlButtonTooltip>

                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlButton
                      v-track-button="{
                        name: 'controls_island_action',
                        action: isDark ? 'switch_to_light_mode' : 'switch_to_dark_mode',
                      }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="isDark ? t('tamagotchi.stage.controls-island.switch-to-light-mode') : t('tamagotchi.stage.controls-island.switch-to-dark-mode')"
                      @click="() => toggleDark()"
                    >
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
                    <ControlButton
                      v-track-button="{
                        name: 'controls_island_action',
                        action: alwaysOnTop ? 'unpin_from_top' : 'pin_on_top',
                      }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top')"
                      @click="toggleAlwaysOnTop"
                    >
                      <div v-if="alwaysOnTop" i-solar:pin-bold :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
                      <div v-else i-solar:pin-linear :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300 opacity-50" />
                    </ControlButton>
                    <template #tooltip>
                      {{ alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top') }}
                    </template>
                  </ControlButtonTooltip>

                  <ControlsIslandFadeOnHover :icon-class="adjustStyleClasses.icon" :button-style="adjustStyleClasses.button" />

                  <ControlButtonTooltip disable-hoverable-content>
                    <ControlButton
                      v-track-button="{ name: 'controls_island_action', action: 'close_app' }"
                      :button-style="adjustStyleClasses.button"
                      :aria-label="t('tamagotchi.stage.controls-island.close')"
                      hover:bg-red-500
                      hover:text-white
                      @click="() => quitApp()"
                    >
                      <div i-solar:close-circle-outline :class="adjustStyleClasses.icon" />
                    </ControlButton>
                    <template #tooltip>
                      {{ t('tamagotchi.stage.controls-island.close') }}
                    </template>
                  </ControlButtonTooltip>
                </div>
              </div>
            </div>
          </ScrollableArea>
        </Transition>

        <!-- Main Controls -->
        <div ref="mainControls" data-testid="main-controls" :class="['shrink-0', mainControlsLayoutClasses]">
          <ControlButtonTooltip side="inward">
            <ControlButton
              v-track-button="{
                name: 'controls_island_action',
                action: expanded ? 'collapse_controls' : 'expand_controls',
              }"
              :button-style="adjustStyleClasses.button"
              :aria-label="expanded ? t('tamagotchi.stage.controls-island.collapse') : t('tamagotchi.stage.controls-island.expand')"
              @click="toggleControls"
            >
              <div
                :class="[adjustStyleClasses.icon, isTop !== expanded ? 'rotate-180' : 'rotate-0']"
                i-solar:alt-arrow-up-line-duotone scale-110 transition-all duration-300
                text="neutral-800 dark:neutral-300"
              />
            </ControlButton>
            <template #tooltip>
              {{ expanded ? t('tamagotchi.stage.controls-island.collapse') : t('tamagotchi.stage.controls-island.expand') }}
            </template>
          </ControlButtonTooltip>

          <StatusIsland
            v-if="IS_DEV"
            :button-style="adjustStyleClasses.button"
            :icon-class="adjustStyleClasses.icon"
          />

          <ControlButtonTooltip side="inward">
            <ControlButton
              v-track-button="{ name: 'controls_island_action', action: 'toggle_chat' }"
              :button-style="adjustStyleClasses.button"
              :aria-label="t('tamagotchi.stage.controls-island.open-chat')"
              @click="() => openChat()"
            >
              <div i-solar:chat-line-line-duotone :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
            </ControlButton>
            <template #tooltip>
              {{ t('tamagotchi.stage.controls-island.open-chat') }}
            </template>
          </ControlButtonTooltip>

          <ControlButtonTooltip side="inward">
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

          <ControlsIslandStopSpeaking
            :button-style="adjustStyleClasses.button"
            :icon-class="adjustStyleClasses.icon"
          />

          <ControlButtonTooltip side="inward">
            <ControlButton :button-style="adjustStyleClasses.button" cursor-move :class="{ 'drag-region': isLinux }" @mousedown="startDraggingWindow?.()">
              <div i-ph:arrows-out-cardinal :class="adjustStyleClasses.icon" text="neutral-800 dark:neutral-300" />
            </ControlButton>
            <template #tooltip>
              {{ t('tamagotchi.stage.controls-island.drag-to-move-window') }}
            </template>
          </ControlButtonTooltip>
        </div>
      </div>
    </ScrollableArea>
  </div>
</template>
