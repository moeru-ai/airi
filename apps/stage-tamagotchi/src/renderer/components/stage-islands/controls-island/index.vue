<script setup lang="ts">
import type { ControlsMenuAction } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { IS_DEV, isElectronWindow } from '@proj-airi/stage-shared'
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { backdropSurfaceHostKey, useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useInboxStore } from '@proj-airi/stage-ui/stores/inbox'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Badge, Dock, DockButton, dockEdgeItemClasses, dockItemClasses, Tooltip } from '@proj-airi/ui'
import { useFocusWithin, useMouseInElement, useMousePressed } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, inject, onScopeDispose, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusIsland from '../status-island/index.vue'
import ControlsIslandChatButton from './controls-island-chat-button.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electronCenterMainWindow,
  electronControlsMenuOpen,
  electronMainWindowRefreshUnread,
  electronStartDraggingWindow,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'
import { isControlsIslandConcealed } from './controls-island-visibility'
import { useControlsIslandPlacement } from './use-controls-island-placement'
import { useControlsIslandSignIn } from './use-controls-island-sign-in'

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

const { t } = useI18n()
const placement = useControlsIslandPlacement()
const { isLeft, isTop, motionPhase } = placement

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const context = useElectronEventaContext()
const { enabled, listening, off: microphoneOff } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const islandElement = useTemplateRef<HTMLElement>('island')
// The dock is the only surface of the Island. Its buttons have no fill, so the native glass is behind the dock only.
const dockInstance = useTemplateRef<InstanceType<typeof Dock>>('dock')
useBackdropSurface(computed(() => dockInstance.value?.$el as HTMLElement | undefined))
// The tooltips portal out of the Island, so each open tooltip declares its own surface.
const registerTooltipSurface = inject(backdropSurfaceHostKey, undefined)?.register

/**
 * The one app menu. It opens in a window of its own beside the more button, so it can extend past this window. The
 * more button opens it, and so does a right-click on the character. The menu window covers the button while the menu
 * shows, so a second click there closes the menu.
 */
const menuOpen = ref(false)
const openMenuWindow = useElectronEventaInvoke(electronControlsMenuOpen)
const centerMainWindow = useElectronEventaInvoke(electronCenterMainWindow)
const { signingIn, signIn } = useControlsIslandSignIn()

// Unread Notifications are in the menu. The dot on the more button tells the user to open it.
const inbox = useInboxStore()
const { unread } = storeToRefs(inbox)

async function openAppMenu() {
  const button = islandElement.value?.querySelector<HTMLElement>('[aria-haspopup="menu"]')
  if (!button)
    return

  const { x, y, width, height } = button.getBoundingClientRect()
  menuOpen.value = true
  // The request answers when the menu closes, with the item that this window carries out.
  let action: ControlsMenuAction | undefined
  try {
    action = await openMenuWindow({
      anchor: { x, y, width, height },
      side: isLeft.value ? 'right' : 'left',
      align: isTop.value ? 'start' : 'end',
      signingIn: signingIn.value,
    })
  }
  catch (error) {
    console.error('Failed to open the app menu:', errorMessageFrom(error) ?? 'unknown')
  }
  finally {
    menuOpen.value = false
  }

  switch (action) {
    case 'sign-in':
      signIn()
      break
    case 'open-hearing':
      openHearing()
      break
    case 'center-main-window':
      centerMainWindow().catch(console.error)
      break
  }
}

// The menu window keeps its own Notifications state. After a read there settles, the server count is final.
const stopUnreadRequest = context.value.on(electronMainWindowRefreshUnread, () => void inbox.refreshUnread())
onScopeDispose(stopUnreadRequest)

// Tracks the open menu and dialogs of the Island, for example 'menu' and 'hearing'.
// The stage keeps the whole window interactive while one is open, and the Island stays in view.
const blockingOverlays = reactive(new Set<string>())
// A press that starts on the Island can end outside it, for example a window drag.
const { pressed } = useMousePressed({ target: islandElement })
const isBlocked = computed(() => blockingOverlays.size > 0 || pressed.value)

function setOverlay(key: string, active: boolean) {
  if (active) {
    blockingOverlays.add(key)
    return
  }

  blockingOverlays.delete(key)
}

watch(menuOpen, open => setOverlay('menu', open))

/** True while the microphone button waits for the permission prompt. The button is disabled, so a second press cannot start another request. */
const microphonePending = ref(false)
const microphoneLabel = computed(() => listening.value
  ? t('tamagotchi.stage.controls-island.disable-microphone')
  : t('tamagotchi.stage.controls-island.enable-microphone'))

/**
 * Turns listening on, or turns the microphone off. The button is on while AIRI listens.
 *
 * Off is the microphone switch, so no feature can record until the microphone is on again. The listening preference
 * stays, so the next press listens again without a permission request.
 * On turns the microphone on. Only a first listening press asks for permission. A refusal opens Hearing controls,
 * which show the reason from the device store. The Hearing input mode still decides when the microphone captures.
 */
async function toggleMicrophone() {
  if (microphonePending.value)
    return
  if (listening.value) {
    microphoneOff.value = true
    return
  }

  microphoneOff.value = false
  if (enabled.value)
    return

  microphonePending.value = true
  try {
    if (await settingsAudioDeviceStore.askPermission()) {
      enabled.value = true
      return
    }
    setOverlay('hearing', true)
  }
  finally {
    microphonePending.value = false
  }
}

function openHearing() {
  setOverlay('hearing', true)
}

// NOTICE: On native Wayland, `isOutsideByCursor` can get permanently stuck
// because it is driven by Electron's screen.getCursorScreenPoint(), which
// Chromium's Ozone/Wayland backend cannot query reliably the way X11 does.
// Source: https://github.com/moeru-ai/airi/issues/2521 (CachyOS + KDE
// Plasma, Flatpak). OR it with the DOM-based `isOutsideByDom`
// (useMouseInElement), which self-corrects on every pointermove and needs
// no OS-level cursor query, so a broken cursor signal cannot force a false
// collapse. The stage reads this paired result for click-through hit
// testing, where DOM events may not reach the renderer at all.
// Removal condition: once Ozone/Wayland reports the absolute
// cursor position reliably upstream, or the click-through hit-testing no
// longer depends on this composable.
const { isOutside: isOutsideByCursor } = useElectronMouseInElement(islandElement)
const { isOutside: isOutsideByDom } = useMouseInElement(islandElement)
const isOutside = computed(() => isOutsideByCursor.value && isOutsideByDom.value)

// A user who works in the menu, in a dialog, or with the keyboard keeps the
// Island after the cursor leaves the window.
const { focused: islandFocused } = useFocusWithin(islandElement)
const concealed = computed(() => isControlsIslandConcealed({
  cursorAway: props.cursorAway,
  overlayOpen: blockingOverlays.size > 0,
  pressed: pressed.value,
  focused: islandFocused.value,
}))

// The stage page observes this element for cursor hit testing.
defineExpose({
  get element() { return islandElement.value },
  get isOutside() { return isOutside.value },
  get overlayActive() { return blockingOverlays.size > 0 || pressed.value },
  get hearingDialogOpen() { return blockingOverlays.has('hearing') },
  set hearingDialogOpen(v: boolean) { setOverlay('hearing', v) },
  /** Opens the app menu, for example when the user right-clicks the character. */
  openMenu() { void openAppMenu() },
})

watch(isBlocked, (active) => {
  emit('interactionChange', active)
}, { immediate: true })

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

// The small setting is the size of the floating chat dock. Large and auto are the medium dock.
const dockSize = computed(() => controlsIslandIconSize.value === 'small' ? 'sm' : 'md')
const iconClass = computed(() => dockSize.value === 'sm' ? 'size-4' : 'size-5')
// The tooltips open into the window, away from the screen corner that the Island docks to.
const tooltipSide = computed(() => isLeft.value ? 'right' : 'left')

// The grip is shorter than it is wide, and it sits at the end of the dock that faces into the window.
const gripClasses = computed(() => [
  dockSize.value === 'sm' ? 'h-5 w-7' : 'h-6 w-9',
  dockEdgeItemClasses(dockSize.value, 'vertical', isTop.value ? 'end' : 'start'),
])

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

/**
 * The native drag of the main process does not work on Linux, so the grip there is a drag region instead. A drag
 * region takes no pointer events, so the grip on Linux has no hover background and no tooltip.
 *
 * See `apps/stage-tamagotchi/src/main/windows/main/index.ts` for the handler.
 */
const linuxWindow = isElectronWindow(window) && window.platform === 'linux'
const startDraggingWindow = linuxWindow ? undefined : defineInvoke(context.value, electronStartDraggingWindow)
</script>

<template>
  <div
    ref="island"
    data-testid="controls-island"
    :class="[
      'fixed',
      islandPositionClasses,
      islandMotionClasses,
    ]"
  >
    <!--
      The Island is a vertical blurry dock, as the dock of the floating chat. The grip sits at the end that faces into
      the window, so `flex-col-reverse` overrides the column of the dock at the top of the screen.
    -->
    <Dock
      ref="dock"
      data-testid="main-controls"
      orientation="vertical"
      variant="blurry"
      :size="dockSize"
      :tooltip-side="tooltipSide"
      :register-surface="registerTooltipSurface"
      :class="[isTop ? 'flex-col-reverse!' : '']"
    >
      <!--
        The grip moves the window. It has the hover background of the dock buttons. Its dots are one step quieter than
        the icons of the buttons: lighter in light mode, and darker in dark mode.
      -->
      <Tooltip
        :label="t('tamagotchi.stage.controls-island.drag-to-move-window')"
        :side="tooltipSide"
        variant="blurry"
        :register-surface="registerTooltipSurface"
      >
        <div
          data-testid="controls-island-grip"
          :aria-label="t('tamagotchi.stage.controls-island.drag-to-move-window')"
          :class="[
            gripClasses,
            'shrink-0 flex cursor-move items-center justify-center transition-colors',
            dockItemClasses('blurry'),
            { 'drag-region': linuxWindow },
          ]"
          @mousedown="startDraggingWindow?.()"
        >
          <span aria-hidden="true" :class="['i-mingcute:dots-vertical-fill size-4 text-neutral-400/70 dark:text-neutral-400']" />
        </div>
      </Tooltip>

      <StatusIsland v-if="IS_DEV" :icon-class="iconClass" />

      <!-- While AIRI listens, only the icon takes the theme color, as every toggle of a dock. -->
      <DockButton
        data-testid="controls-island-microphone"
        :label="microphoneLabel"
        :pressed="listening"
        :aria-busy="microphonePending"
        :disabled="microphonePending"
        @click="toggleMicrophone"
      >
        <Transition name="fade" mode="out-in">
          <IndicatorMicVolume v-if="listening" color-class="" :class="iconClass" />
          <span v-else :class="['i-mingcute:mic-off-line', iconClass]" />
        </Transition>
      </DockButton>

      <ControlsIslandChatButton :icon-class="iconClass" />

      <DockButton
        data-testid="controls-island-more"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        :label="t('tamagotchi.stage.controls-island.more')"
        :tooltip="!menuOpen"
        :class="['relative']"
        @click="openAppMenu"
      >
        <span :class="['i-mingcute:more-1-line', iconClass]" />
        <Badge
          v-if="unread > 0"
          dot
          data-testid="controls-island-notifications-dot"
          :class="['pointer-events-none absolute right-1 top-1 ring-2 ring-neutral-50 dark:ring-neutral-800']"
        />
      </DockButton>
    </Dock>

    <!-- The menu and the microphone button open Hearing controls. The dialog needs a trigger, so it gets a hidden one. -->
    <HearingConfigDialog :show="blockingOverlays.has('hearing')" @update:show="setOverlay('hearing', $event)">
      <span aria-hidden="true" :class="['hidden']" />
    </HearingConfigDialog>
  </div>
</template>
