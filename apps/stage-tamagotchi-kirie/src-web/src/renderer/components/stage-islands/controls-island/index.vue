<script setup lang="ts">
import { useHostAlwaysOnTop, useHostAppQuit, useHostChat, useHostEventaInvoke, useHostMouseInElement, useHostWindowCenter, useHostWindowMove } from '@proj-airi/stage-host-context'
import { IS_DEV } from '@proj-airi/stage-shared'
import { HearingConfigDialog, InboxPanel } from '@proj-airi/stage-ui/components'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Badge, IconButton, ScrollableArea, useTheme } from '@proj-airi/ui'
import { refDebounced, useFocusWithin, useIntervalFn, useMouseInElement, useMousePressed, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, reactive, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusIsland from '../status-island/index.vue'
import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandAuthButton from './controls-island-auth-button.vue'
import ControlsIslandFadeOnHover from './controls-island-fade-on-hover.vue'
import ControlsIslandProfilePicker from './controls-island-profile-picker.vue'
import ControlsIslandSpeechMute from './controls-island-speech-mute.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electronOpenSettings,
} from '../../../../shared/eventa'
import { useControlsIslandLayout } from './use-controls-island-layout'
import { useControlsIslandPlacement } from './use-controls-island-placement'

interface Emits {
  /** Reports whether an active interaction must delay placement changes. */
  interactionChange: [active: boolean]
}

const props = withDefaults(defineProps<{
  /**
   * The cursor is away from the stage window, so the Island hides. The stage
   * page owns the cursor signals and decides this.
   */
  cursorAway?: boolean
}>(), {
  cursorAway: false,
})

const emit = defineEmits<Emits>()

const { themeMode, switchToNextTheme } = useTheme()
const { t } = useI18n()

// The button shows the current theme, and its label tells what a press selects.
const themeIcons = {
  light: 'i-solar:sun-2-outline',
  dark: 'i-solar:moon-outline',
  auto: 'i-lucide:contrast',
} as const
const themeActions = {
  light: 'switch_to_dark_mode',
  dark: 'switch_to_system_mode',
  auto: 'switch_to_light_mode',
} as const
const themeLabel = computed(() => ({
  light: t('tamagotchi.stage.controls-island.switch-to-dark-mode'),
  dark: t('tamagotchi.stage.controls-island.switch-to-system-mode'),
  auto: t('tamagotchi.stage.controls-island.switch-to-light-mode'),
})[themeMode.value])
const placement = useControlsIslandPlacement()
const { dock, isLeft, isTop, motionPhase } = placement

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const { enabled } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const openSettings = useHostEventaInvoke(electronOpenSettings)
const openChat = useHostChat()
const quitApp = useHostAppQuit()
const setAlwaysOnTop = useHostAlwaysOnTop()
const centerMainWindow = useHostWindowCenter()
const { beginMove, isNativeMoveSupported, usesCssDragRegion } = useHostWindowMove()

const expanded = ref(false)
// The store also polls the unread count, so the collapse button can show a dot while the menu is closed.
const inbox = useInboxStore()
const {
  unread: notificationsUnread,
  messages: notificationMessages,
  loading: notificationsLoading,
  error: notificationsError,
  hasMore: notificationsHasMore,
  signedIn: notificationsSignedIn,
} = storeToRefs(inbox)
const now = useNow({ interval: 60_000 })
const notificationsLabel = computed(() => notificationsUnread.value > 0
  ? t('stage.notifications.open-unread', { count: notificationsUnread.value })
  : t('stage.notifications.open'))
/** The menu card shows the controls or, after the Notifications row, the Notifications list. */
const menuView = ref<'controls' | 'notifications'>('controls')
// Closing disables interaction immediately. Keep layout until the exit
// animation ends, then isolate the same menu for natural-size measurement.
const panelPresent = ref(false)
const islandElement = useTemplateRef<HTMLElement>('island')
const profileCreationActive = ref(false)
const islandScrollArea = useTemplateRef<InstanceType<typeof ScrollableArea>>('islandScrollArea')
const islandViewport = computed(() => islandScrollArea.value?.viewport)
const islandContent = useTemplateRef<HTMLElement>('islandContent')
const mainControlsElement = useTemplateRef<HTMLElement>('mainControls')
const menuContent = useTemplateRef<HTMLElement>('menuContent')
const menuScrollArea = useTemplateRef<InstanceType<typeof ScrollableArea>>('menuScrollArea')
const menuViewport = computed(() => menuScrollArea.value?.viewport)
const availableSpaceElement = useTemplateRef<HTMLElement>('availableSpace')
const gapElement = useTemplateRef<HTMLElement>('gap')
const menuId = useId()
const profileOpen = ref(false)
const { direction, scrollWholeIsland, panelStyle, layoutClasses: islandLayoutClasses, arrowRotation, motionOffset } = useControlsIslandLayout({
  main: mainControlsElement,
  menu: menuContent,
  available: availableSpaceElement,
  gap: gapElement,
  viewport: islandViewport,
  menuViewport,
  content: islandContent,
}, expanded, placement)

// Tracks open overlays/dialogs that should prevent auto-collapse (e.g. 'hearing', 'profile-picker')
const blockingOverlays = reactive(new Set<string>())
// A scrollbar drag can leave the visible boundary before the user releases it.
const { pressed } = useMousePressed({ target: islandElement })
const isBlocked = computed(() => blockingOverlays.size > 0 || pressed.value)

function setOverlay(key: string, active: boolean) {
  if (active) {
    blockingOverlays.add(key)
    return
  }

  blockingOverlays.delete(key)
}

/** True while the microphone button waits for the permission prompt. The button is disabled, so a second press cannot start another request. */
const microphonePending = ref(false)
const microphoneLabel = computed(() => enabled.value
  ? t('tamagotchi.stage.controls-island.disable-microphone')
  : t('tamagotchi.stage.controls-island.enable-microphone'))

/**
 * Turns the microphone preference on or off. The Hearing input mode still decides when the microphone captures.
 * Only this press asks for permission. A refusal opens Hearing controls, which show the reason from the device store.
 */
async function toggleMicrophone() {
  if (microphonePending.value)
    return
  if (enabled.value) {
    enabled.value = false
    return
  }

  microphonePending.value = true
  try {
    if (await settingsAudioDeviceStore.askPermission()) {
      enabled.value = true
      return
    }
    // The dialog trigger lives in the menu, so the menu opens with it.
    expanded.value = true
    setOverlay('hearing', true)
  }
  finally {
    microphonePending.value = false
  }
}

// NOTICE: On native Wayland, `isOutsideByCursor` can get permanently stuck
// because it is driven by the host cursor query, which native Wayland cannot
// query reliably the way X11 does.
// Source: https://github.com/moeru-ai/airi/issues/2521 (CachyOS + KDE
// Plasma, Flatpak). OR it with the DOM-based `isOutsideByDom`
// (useMouseInElement), which self-corrects on every pointermove and needs
// no OS-level cursor query, so a broken cursor signal cannot force a false
// collapse. The stage reads this paired result for click-through hit
// testing, where DOM events may not reach the renderer at all.
// Removal condition: once Wayland reports the absolute cursor position
// reliably upstream, or the click-through hit-testing no longer depends on
// this composable.
const { isOutside: isOutsideByCursor } = useHostMouseInElement(islandElement)
const { isOutside: isOutsideByDom } = useMouseInElement(islandElement)
const isOutside = computed(() => isOutsideByCursor.value && isOutsideByDom.value)
const isOutsideAfter2seconds = refDebounced(isOutside, 1500)

// A user who works in the menu, in a dialog, or with the keyboard keeps the
// Island after the cursor leaves the window.
const { focused: islandFocused } = useFocusWithin(islandElement)
const concealed = computed(() => props.cursorAway && !expanded.value && !isBlocked.value && !islandFocused.value)

// The stage page observes this element for cursor hit testing.
defineExpose({
  get element() { return islandElement.value },
  get isOutside() { return isOutside.value },
  get overlayActive() { return blockingOverlays.size > 0 || pressed.value },
  get hearingDialogOpen() { return blockingOverlays.has('hearing') },
  set hearingDialogOpen(v: boolean) { setOverlay('hearing', v) },
})

watch(isOutsideAfter2seconds, (outside) => {
  if (outside && expanded.value && !isBlocked.value) {
    expanded.value = false
  }
})

watch(expanded, (isExpanded) => {
  if (isExpanded)
    panelPresent.value = true
  if (!isExpanded) {
    profileCreationActive.value = false
    if (menuContent.value?.contains(document.activeElement) || blockingOverlays.size > 0)
      mainControlsElement.value?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus()
    profileOpen.value = false
    menuView.value = 'controls'
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
    .catch(error => console.error('[host-context] Failed to update always-on-top state.', error))
}, { immediate: true })

function toggleAlwaysOnTop() {
  alwaysOnTop.value = !alwaysOnTop.value
}

async function showNotifications() {
  menuView.value = 'notifications'
  void inbox.loadFirstPage()
  await nextTick()
  menuContent.value?.querySelector<HTMLButtonElement>('[data-testid="controls-island-notifications-back"]')?.focus()
}

async function showControls() {
  menuView.value = 'controls'
  await nextTick()
  menuContent.value?.querySelector<HTMLButtonElement>('[data-testid="controls-island-notifications"]')?.focus()
}

// A sign-out removes the Notifications row, so the list must not stay without a way back to it.
watch(notificationsSignedIn, (signedIn) => {
  if (!signedIn)
    menuView.value = 'controls'
})

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
    isHidden ? 'scale-95' : 'scale-100',
    isHidden || concealed.value ? 'opacity-0' : 'opacity-100',
    isHidden && isLeft.value ? '-translate-x-3' : '',
    isHidden && !isLeft.value ? 'translate-x-3' : '',
    isHidden && isTop.value ? '-translate-y-2' : '',
    isHidden && !isTop.value ? 'translate-y-2' : '',
  ]
})
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

function startDraggingWindow() {
  if (!isNativeMoveSupported.value)
    return

  beginMove()
    .catch(error => console.error('[host-context] Failed to begin moving the host window.', error))
}

function refreshWindow() {
  window.location.reload()
}

/**
 * Requests the host process to move the AIRI desktop window back to screen center.
 */
function resetMainWindowPosition() {
  centerMainWindow().catch(console.error)
}
</script>

<template>
  <div
    ref="island"
    data-testid="controls-island"
    :data-direction="direction"
    :data-scroll-owner="scrollWholeIsland ? 'island' : 'menu'"
    :class="[
      'fixed max-h-[calc(100dvh-1rem)] max-w-[calc(100dvw-1rem)]',
      islandPositionClasses,
      islandMotionClasses,
    ]"
  >
    <!-- Probes track viewport/rem sizes without adding scrollable overflow. -->
    <div aria-hidden="true" :class="['pointer-events-none invisible fixed size-0 overflow-hidden [contain:strict]']">
      <div ref="availableSpace" :class="['h-[calc(100dvh-1rem)] w-[calc(100dvw-1rem)]']" />
      <div ref="gap" :class="['size-3']" />
    </div>
    <ScrollableArea
      ref="islandScrollArea"
      orientation="both"
      :class="['max-h-[inherit] max-w-[inherit]']"
      viewport-class="overscroll-contain"
    >
      <div ref="islandContent" :class="['relative w-max flex', panelPresent ? 'gap-3' : '', islandLayoutClasses]">
        <!-- iOS Style Drawer Panel -->
        <div
          :inert="!expanded"
          :aria-hidden="!expanded"
          :class="panelPresent ? 'contents' : 'pointer-events-none invisible absolute size-0 overflow-hidden [contain:strict]'"
        >
          <ScrollableArea
            :id="menuId"
            ref="menuScrollArea"
            data-testid="controls-menu"
            orientation="both"
            :style="panelStyle"
            :class="['w-max shrink-0 rounded-2xl', panelPositionClasses]"
            viewport-class="overscroll-contain"
          >
            <div
              ref="menuContent"
              :class="['w-max', expanded ? 'controls-menu-enter' : panelPresent ? 'controls-menu-leave' : 'opacity-0']"
              :style="{ '--menu-offset': motionOffset }"
              @animationend.self="panelPresent = expanded"
            >
              <div
                :class="[
                  'w-max flex flex-col gap-1 rounded-2xl border border-neutral-200 p-2 dark:border-neutral-800',
                  'bg-neutral-100/80 shadow-2xl shadow-black/20 backdrop-blur-xl dark:bg-neutral-900/80',
                ]"
              >
                <!--
                  The Notifications row switches this card to the Notifications list in place.
                  The list stays inside the island, so the stage hit test already covers it.
                -->
                <div v-if="menuView === 'notifications'" data-testid="controls-island-notifications-view" :class="['w-80']">
                  <InboxPanel
                    :messages="notificationMessages" :now="now" :unread="notificationsUnread"
                    :loading="notificationsLoading" :error="notificationsError" :has-more="notificationsHasMore"
                    surface="drawer"
                    @open="inbox.markRead" @read-all="inbox.markAllRead" @retry="inbox.loadFirstPage" @load-more="inbox.loadMore"
                  >
                    <template #leading>
                      <IconButton
                        data-testid="controls-island-notifications-back"
                        :aria-label="t('stage.notifications.back')" :title="t('stage.notifications.back')"
                        :class="[
                          'size-8 rounded-full outline-none',
                          'text-neutral-600 hover:bg-black/5 hover:text-neutral-900',
                          'dark:text-neutral-300 dark:hover:bg-white/5 dark:hover:text-white',
                          'focus-visible:outline-2 focus-visible:outline-primary-400',
                        ]"
                        @click="showControls"
                      >
                        <span aria-hidden="true" :class="['i-solar:alt-arrow-left-linear size-5']" />
                      </IconButton>
                    </template>
                  </InboxPanel>
                </div>
                <!-- v-show keeps dialogs and listeners of the controls mounted while the list shows. -->
                <div v-show="menuView === 'controls'" :class="['flex flex-col gap-1']">
                  <ControlsIslandAuthButton
                    :active="expanded"
                    :button-style="adjustStyleClasses.button"
                    :icon-class="adjustStyleClasses.icon"
                  />

                  <!--
                    The same Notifications row as the mobile menu. It is a plain button like the account card above,
                    because BasicButton centers its content and does not suit a full-width row.
                  -->
                  <button
                    v-if="notificationsSignedIn"
                    type="button"
                    data-testid="controls-island-notifications"
                    :aria-label="notificationsLabel"
                    :class="[
                      'mb-1.5 flex items-center gap-2.5 rounded-xl px-3 py-2',
                      'bg-black/4 hover:bg-black/8 dark:bg-white/4 dark:hover:bg-white/8',
                      'text-sm text-neutral-800 dark:text-neutral-200',
                      'cursor-pointer border-none outline-none transition-colors duration-200',
                      'focus-visible:outline-2 focus-visible:outline-primary-500',
                    ]"
                    @click="showNotifications"
                  >
                    <span aria-hidden="true" :class="['i-solar:bell-outline shrink-0 text-neutral-500 dark:text-neutral-400', adjustStyleClasses.icon]" />
                    <span :class="['flex-1 text-left']">{{ t('stage.notifications.title') }}</span>
                    <Badge :count="notificationsUnread" data-testid="controls-island-notifications-count" />
                    <span aria-hidden="true" :class="['i-solar:alt-arrow-right-outline size-4 shrink-0 text-neutral-400']" />
                  </button>

                  <div :class="['grid grid-cols-3 gap-2']">
                    <ControlButtonTooltip disable-hoverable-content>
                      <ControlButton
                        v-track-button="{ name: 'controls_island_action', action: 'toggle_settings' }"
                        :button-style="adjustStyleClasses.button"
                        :aria-label="t('tamagotchi.stage.controls-island.open-settings')"
                        @click="openSettings({ route: '/settings' })"
                      >
                        <div :class="['i-solar:settings-minimalistic-outline text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
                      </ControlButton>
                      <template #tooltip>
                        {{ t('tamagotchi.stage.controls-island.open-settings') }}
                      </template>
                    </ControlButtonTooltip>

                    <ControlButtonTooltip disable-hoverable-content>
                      <ControlsIslandProfilePicker
                        v-model:open="profileOpen"
                        v-model:creating="profileCreationActive"
                        :active="expanded"
                        @interaction-change="setOverlay('profile-picker', $event)"
                      >
                        <template #default="{ toggle }">
                          <ControlButton
                            v-track-button="{ name: 'controls_island_action', action: 'toggle_profile_picker' }"
                            :button-style="adjustStyleClasses.button"
                            :aria-label="t('tamagotchi.stage.controls-island.switch-profile')"
                            @click="toggle"
                          >
                            <div :class="['i-solar:emoji-funny-square-broken text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
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
                        <div :class="['i-solar:refresh-linear text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
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
                        <div :class="['i-solar:target-linear text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
                      </ControlButton>
                      <template #tooltip>
                        {{ t('tamagotchi.stage.controls-island.center-main-window') }}
                      </template>
                    </ControlButtonTooltip>

                    <ControlButtonTooltip disable-hoverable-content>
                      <ControlButton
                        v-track-button="{
                          name: 'controls_island_action',
                          action: themeActions[themeMode],
                        }"
                        :button-style="adjustStyleClasses.button"
                        :aria-label="themeLabel"
                        @click="switchToNextTheme"
                      >
                        <Transition name="fade" mode="out-in">
                          <div :key="themeMode" :class="[themeIcons[themeMode], 'text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
                        </Transition>
                      </ControlButton>
                      <template #tooltip>
                        {{ themeLabel }}
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
                        <div v-if="alwaysOnTop" :class="['i-solar:pin-bold text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
                        <div v-else :class="['i-solar:pin-linear text-neutral-800 dark:text-neutral-300 opacity-50', adjustStyleClasses.icon]" />
                      </ControlButton>
                      <template #tooltip>
                        {{ alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top') }}
                      </template>
                    </ControlButtonTooltip>

                    <ControlsIslandFadeOnHover :icon-class="adjustStyleClasses.icon" :button-style="adjustStyleClasses.button" />

                    <ControlButtonTooltip disable-hoverable-content>
                      <HearingConfigDialog :show="blockingOverlays.has('hearing')" @update:show="setOverlay('hearing', $event)">
                        <ControlButton
                          data-testid="controls-island-hearing-controls"
                          :button-style="adjustStyleClasses.button"
                          :aria-label="t('tamagotchi.stage.controls-island.open-hearing-controls')"
                        >
                          <div :class="['i-solar:microphone-3-linear text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
                        </ControlButton>
                      </HearingConfigDialog>
                      <template #tooltip>
                        {{ t('tamagotchi.stage.controls-island.open-hearing-controls') }}
                      </template>
                    </ControlButtonTooltip>

                    <ControlButtonTooltip disable-hoverable-content>
                      <ControlButton
                        v-track-button="{ name: 'controls_island_action', action: 'close_app' }"
                        :button-style="adjustStyleClasses.button"
                        :aria-label="t('tamagotchi.stage.controls-island.close')"
                        :class="['hover:bg-red-500 hover:text-white']"
                        @click="() => quitApp()"
                      >
                        <div :class="['i-solar:close-circle-outline', adjustStyleClasses.icon]" />
                      </ControlButton>
                      <template #tooltip>
                        {{ t('tamagotchi.stage.controls-island.close') }}
                      </template>
                    </ControlButtonTooltip>
                  </div>
                </div>
              </div>
            </div>
          </ScrollableArea>
        </div>

        <!-- Main Controls -->
        <div ref="mainControls" data-testid="main-controls" :class="['shrink-0', mainControlsLayoutClasses]">
          <ControlButtonTooltip side="inward">
            <ControlButton
              v-track-button="{
                name: 'controls_island_action',
                action: expanded ? 'collapse_controls' : 'expand_controls',
              }"
              :button-style="adjustStyleClasses.button"
              :aria-expanded="expanded"
              :aria-controls="menuId"
              :aria-label="expanded ? t('tamagotchi.stage.controls-island.collapse') : t('tamagotchi.stage.controls-island.expand')"
              :class="['relative']"
              @click="toggleControls"
            >
              <div
                :class="['i-solar:alt-arrow-up-line-duotone scale-110 transition-all duration-300', 'text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]"
                :style="{ transform: `rotate(${arrowRotation}deg)` }"
              />
              <!-- Unread Notifications are in the menu. The dot tells the user to open it. -->
              <Badge
                v-if="notificationsUnread > 0"
                dot
                data-testid="controls-island-notifications-dot"
                :class="['pointer-events-none absolute right-1 top-1 ring-2 ring-neutral-100 dark:ring-neutral-900']"
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
              <div :class="['i-solar:chat-line-line-duotone text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
            </ControlButton>
            <template #tooltip>
              {{ t('tamagotchi.stage.controls-island.open-chat') }}
            </template>
          </ControlButtonTooltip>

          <ControlButtonTooltip side="inward">
            <ControlButton
              data-testid="controls-island-microphone"
              :button-style="adjustStyleClasses.button"
              :aria-label="microphoneLabel"
              :aria-pressed="enabled"
              :aria-busy="microphonePending"
              :disabled="microphonePending"
              @click="toggleMicrophone"
            >
              <Transition name="fade" mode="out-in">
                <IndicatorMicVolume v-if="enabled" :class="adjustStyleClasses.icon" />
                <div v-else :class="['i-ph:microphone-slash text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
              </Transition>
            </ControlButton>
            <template #tooltip>
              {{ microphoneLabel }}
            </template>
          </ControlButtonTooltip>

          <ControlsIslandSpeechMute
            :button-style="adjustStyleClasses.button"
            :icon-class="adjustStyleClasses.icon"
          />

          <ControlButtonTooltip side="inward">
            <ControlButton :button-style="adjustStyleClasses.button" :class="['cursor-move', { 'drag-region': usesCssDragRegion }]" @mousedown="startDraggingWindow">
              <div :class="['i-ph:arrows-out-cardinal text-neutral-800 dark:text-neutral-300', adjustStyleClasses.icon]" />
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

<style scoped>
.controls-menu-enter {
  animation: controls-menu-enter 400ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

.controls-menu-leave {
  animation: controls-menu-leave 300ms ease-in both;
}

@keyframes controls-menu-enter {
  from {
    opacity: 0;
    transform: translate(var(--menu-offset)) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}
@keyframes controls-menu-leave {
  from {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  to {
    opacity: 0;
    transform: translate(var(--menu-offset)) scale(0.9);
  }
}
</style>
