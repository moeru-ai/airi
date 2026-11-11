<script setup lang="ts">
import { defineInvoke } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { IS_DEV } from '@proj-airi/stage-shared'
import { HearingConfigDialog } from '@proj-airi/stage-ui/components'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { Badge } from '@proj-airi/ui'
import { useEventListener, useFocusWithin, useMouseInElement, useMousePressed } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusIsland from '../status-island/index.vue'
import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ControlsIslandChatButton from './controls-island-chat-button.vue'
import ControlsIslandMenu from './controls-island-menu.vue'
import IndicatorMicVolume from './indicator-mic-volume.vue'

import {
  electron,
  electronStartDraggingWindow,
  electronWindowSetAlwaysOnTop,
} from '../../../../shared/eventa'
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

const { t } = useI18n()
const placement = useControlsIslandPlacement()
const { isLeft, isTop, motionPhase } = placement

const settingsAudioDeviceStore = useSettingsAudioDevice()
const settingsStore = useSettings()
const context = useElectronEventaContext()
const { enabled, listening, off: microphoneOff } = storeToRefs(settingsAudioDeviceStore)
const { alwaysOnTop, controlsIslandIconSize } = storeToRefs(settingsStore)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
const setAlwaysOnTop = useElectronEventaInvoke(electronWindowSetAlwaysOnTop)

const islandElement = useTemplateRef<HTMLElement>('island')

/** The one app menu. The more button opens it, and so does a right-click on the character. */
const menuOpen = ref(false)
// The menu lives on the desktop, so a click in another app must close it. That click blurs this window.
useEventListener(window, 'blur', () => {
  menuOpen.value = false
})

// Tracks open overlays that portal outside the Island, for example 'menu' and 'hearing'.
// The stage keeps the whole window interactive while one is open.
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
  menuOpen.value = false
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
const concealed = computed(() => props.cursorAway && !isBlocked.value && !islandFocused.value)

// The stage page observes this element for cursor hit testing.
defineExpose({
  get element() { return islandElement.value },
  get isOutside() { return isOutside.value },
  get overlayActive() { return blockingOverlays.size > 0 || pressed.value },
  get hearingDialogOpen() { return blockingOverlays.has('hearing') },
  set hearingDialogOpen(v: boolean) { setOverlay('hearing', v) },
  /** Opens the app menu, for example when the user right-clicks the character. */
  openMenu() { menuOpen.value = true },
})

watch(isBlocked, (active) => {
  emit('interactionChange', active)
}, { immediate: true })

// Apply alwaysOnTop on mount and when it changes
watch(alwaysOnTop, (val) => {
  setAlwaysOnTop(val)
}, { immediate: true })

const iconClass = computed(() => controlsIslandIconSize.value === 'small' ? 'size-3' : 'size-5')
const buttonStyle = computed(() => controlsIslandIconSize.value === 'small' ? 'border-0 p-0.5' : 'border-2 p-2')

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
 * This is a know issue (or expected behavior maybe) to Electron.
 * We don't use this approach on Linux because it's not working.
 *
 * See `apps/stage-tamagotchi/src/main/windows/main/index.ts` for handler definition
 */
const startDraggingWindow = !isLinux() ? defineInvoke(context.value, electronStartDraggingWindow) : undefined
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
    <div
      data-testid="main-controls"
      :class="[
        'flex items-center gap-1 rounded-full p-1',
        'bg-neutral-50/60 shadow-sm backdrop-blur-md dark:bg-neutral-900/50',
        isTop ? 'flex-col-reverse' : 'flex-col',
      ]"
    >
      <!-- The grip moves the window. -->
      <ControlButtonTooltip side="inward">
        <div
          data-testid="controls-island-grip"
          :aria-label="t('tamagotchi.stage.controls-island.drag-to-move-window')"
          :class="['h-4 w-8 flex cursor-move items-center justify-center', { 'drag-region': isLinux }]"
          @mousedown="startDraggingWindow?.()"
        >
          <span aria-hidden="true" :class="['h-1 w-5 rounded-full bg-neutral-400/70 dark:bg-neutral-500/70']" />
        </div>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.drag-to-move-window') }}
        </template>
      </ControlButtonTooltip>

      <StatusIsland
        v-if="IS_DEV"
        :button-style="buttonStyle"
        :icon-class="iconClass"
      />

      <ControlButtonTooltip side="inward">
        <ControlButton
          data-testid="controls-island-microphone"
          :button-style="buttonStyle"
          :aria-label="microphoneLabel"
          :aria-pressed="listening"
          :aria-busy="microphonePending"
          :disabled="microphonePending"
          :class="['rounded-full!']"
          @click="toggleMicrophone"
        >
          <Transition name="fade" mode="out-in">
            <IndicatorMicVolume v-if="listening" :class="iconClass" />
            <div v-else :class="['i-ph:microphone-slash text-neutral-800 dark:text-neutral-300', iconClass]" />
          </Transition>
        </ControlButton>
        <template #tooltip>
          {{ microphoneLabel }}
        </template>
      </ControlButtonTooltip>

      <ControlsIslandChatButton :button-style="`${buttonStyle} rounded-full!`" :icon-class="iconClass" />

      <ControlsIslandMenu
        v-model:open="menuOpen"
        :side="isLeft ? 'right' : 'left'"
        :align="isTop ? 'start' : 'end'"
        @open-hearing="openHearing"
      >
        <template #trigger="{ unread }">
          <ControlButton
            data-testid="controls-island-more"
            :button-style="buttonStyle"
            :aria-label="t('tamagotchi.stage.controls-island.more')"
            :title="t('tamagotchi.stage.controls-island.more')"
            :class="['relative rounded-full!']"
          >
            <div :class="['i-solar:menu-dots-bold text-neutral-800 dark:text-neutral-300', iconClass]" />
            <!-- Unread Notifications are in the menu. The dot tells the user to open it. -->
            <Badge
              v-if="unread > 0"
              dot
              data-testid="controls-island-notifications-dot"
              :class="['pointer-events-none absolute right-1 top-1 ring-2 ring-neutral-100 dark:ring-neutral-900']"
            />
          </ControlButton>
        </template>
      </ControlsIslandMenu>
    </div>

    <!-- The menu and the microphone button open Hearing controls. The dialog needs a trigger, so it gets a hidden one. -->
    <HearingConfigDialog :show="blockingOverlays.has('hearing')" @update:show="setOverlay('hearing', $event)">
      <span aria-hidden="true" :class="['hidden']" />
    </HearingConfigDialog>
  </div>
</template>
