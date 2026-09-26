<script setup lang="ts">
import type { ChatFloatingState } from '../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'

import {
  electronChatFloatingContentHidden,
  electronChatFloatingGetState,
  electronChatFloatingMoveTo,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
} from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'

const { activeCard } = storeToRefs(useAiriCardStore())
const sessionsDrawerOpen = shallowRef(false)
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const { t } = useI18n()

// Folded until the main process answers, so the first unfold plays the same
// animation as every later one.
const state = shallowRef<ChatFloatingState>({ placement: 'attached', side: 'left', folded: true, relocating: false, pinned: false })
const getState = useElectronEventaInvoke(electronChatFloatingGetState)
const reportContentHidden = useElectronEventaInvoke(electronChatFloatingContentHidden)
const resizeBy = useElectronEventaInvoke(electronChatFloatingResizeBy)
const moveTo = useElectronEventaInvoke(electronChatFloatingMoveTo)

// The main process can emit before this page mounts, so the first state comes
// from the invoke and later ones from the event.
const stopStateChanged = getElectronEventaContext().on(electronChatFloatingStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopStateChanged)
onMounted(async () => {
  state.value = await getState()
})

useChatDraftHandover(interactiveArea)
const { hitTest } = useChatFloatingClickThrough({ pinned: () => state.value.pinned })

const freePlacement = computed(() => state.value.placement === 'free')
// The content stays mounted while it is hidden, so a fold or a move to the
// other side keeps the unsent draft, attachments and reply target.
const contentShown = computed(() => !state.value.folded && !state.value.relocating)
// Menus and dialogs close as the content hides, so they neither stay on
// screen during the fold nor come back with the next unfold.
watch(contentShown, (shown) => {
  if (!shown)
    void dismissOverlays()
})

// The character stands on the other side of the chat: the chat folds toward
// it, and the resize grip sits away from it.
const characterOnLeft = computed(() => state.value.side === 'right')

interface WindowDelta {
  deltaX: number
  deltaY: number
}

/**
 * A press on the resize grip or the drag handle, in screen pixels, which stay
 * valid while the window moves under the pointer. Pointer capture sends the
 * moves to the pressed element even when the window lags behind the pointer.
 */
interface HeldPointer {
  pressX: number
  pressY: number
  /** Window position when the press started. */
  windowX: number
  windowY: number
  /** Pointer movement already sent as resize steps. */
  resizedX: number
  resizedY: number
}

/** `undefined` when neither the grip nor the handle is held. */
let heldPointer: HeldPointer | undefined

function holdPointer(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  heldPointer = {
    pressX: event.screenX,
    pressY: event.screenY,
    windowX: window.screenX,
    windowY: window.screenY,
    resizedX: 0,
    resizedY: 0,
  }
}

/** Sends the pointer movement since the last step to the main process, which resizes the window. */
function resizeWithHeldPointer(event: PointerEvent) {
  if (!heldPointer)
    return

  // Whole pixels only; the rounding remainder carries into the next step.
  const deltaX = Math.round(event.screenX - heldPointer.pressX) - heldPointer.resizedX
  const deltaY = Math.round(event.screenY - heldPointer.pressY) - heldPointer.resizedY
  if (deltaX === 0 && deltaY === 0)
    return

  heldPointer.resizedX += deltaX
  heldPointer.resizedY += deltaY
  void resizeBy({ deltaX, deltaY })
}

/**
 * Asks for the window position that the pointer movement since the press
 * gives. It is measured from the press, not from the window: a screen edge
 * can stop the window, and a drag that goes on must still reach the next
 * display.
 */
function moveWithHeldPointer(event: PointerEvent) {
  if (!heldPointer)
    return

  void moveTo({
    x: Math.round(heldPointer.windowX + event.screenX - heldPointer.pressX),
    y: Math.round(heldPointer.windowY + event.screenY - heldPointer.pressY),
  })
}

// Capture ends on release, cancel or removal of the element alike.
function releasePointer() {
  heldPointer = undefined
}

/** Keyboard step for the resize grip and the drag handle, in screen pixels. */
const keyboardStep = 16

/** Moves or resizes the window from the arrow keys, as a pointer drag would. */
function handleArrowKey(event: KeyboardEvent, applyDelta: (delta: WindowDelta) => unknown) {
  const step = event.shiftKey ? keyboardStep * 4 : keyboardStep
  const deltas: Record<string, WindowDelta> = {
    ArrowLeft: { deltaX: -step, deltaY: 0 },
    ArrowRight: { deltaX: step, deltaY: 0 },
    ArrowUp: { deltaX: 0, deltaY: -step },
    ArrowDown: { deltaX: 0, deltaY: step },
  }
  const delta = deltas[event.key]
  if (!delta)
    return

  event.preventDefault()
  void applyDelta(delta)
}

function moveByKeyboard(delta: WindowDelta) {
  return moveTo({ x: window.screenX + delta.deltaX, y: window.screenY + delta.deltaY })
}
</script>

<template>
  <div
    :class="['relative h-full w-full']"
  >
    <Transition
      :name="characterOnLeft ? 'chat-floating-fold-left' : 'chat-floating-fold-right'"
      @after-enter="hitTest"
      @after-leave="reportContentHidden()"
    >
      <div v-show="contentShown" :class="['absolute inset-0 flex flex-col gap-1 pt-3']">
        <div :class="['flex items-center gap-2 px-4', characterOnLeft ? 'flex-row-reverse' : '']">
          <div
            :class="[
              'shrink-0 rounded-full p-0.5 shadow-md',
              'bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800',
            ]"
          >
            <button
              :title="t('tamagotchi.stage.chat-window.resize')"
              :aria-label="t('tamagotchi.stage.chat-window.resize')"
              :class="[
                'size-8 touch-none rounded-full',
                'flex items-center justify-center outline-none transition-colors text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
                characterOnLeft ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
              ]"
              @pointerdown="holdPointer"
              @pointermove="resizeWithHeldPointer"
              @lostpointercapture="releasePointer"
              @keydown="handleArrowKey($event, resizeBy)"
            >
              <div :class="[characterOnLeft ? 'i-solar:arrow-right-up-linear' : 'i-solar:arrow-left-up-linear', 'size-4']" />
            </button>
          </div>

          <div
            :class="[
              'min-w-0 flex items-center gap-1 rounded-full p-1 shadow-md',
              'bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800',
            ]"
          >
            <button
              v-if="freePlacement"
              :title="t('tamagotchi.stage.chat-window.move')"
              :aria-label="t('tamagotchi.stage.chat-window.move')"
              :class="['h-7 w-5 cursor-grab touch-none rounded-full', 'flex items-center justify-center outline-none transition-colors text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400']"
              @pointerdown="holdPointer"
              @pointermove="moveWithHeldPointer"
              @lostpointercapture="releasePointer"
              @keydown="handleArrowKey($event, moveByKeyboard)"
            >
              <div class="i-ph:dots-six-vertical-bold size-4" />
            </button>
            <GhostButton
              size="unset"
              :class="['min-w-0 gap-2 rounded-full! px-2 py-0.5']"
              @click="sessionsDrawerOpen = true"
            >
              <div class="i-solar:chat-line-bold shrink-0 text-neutral-400 dark:text-neutral-500" />
              <span class="truncate text-sm">{{ activeCard?.name || 'AIRI' }}</span>
            </GhostButton>
            <ChatSpeechMuteButton :class="['rounded-full!']" />
            <ChatWindowStyleMenu :class="['rounded-full!']" />
          </div>
        </div>

        <div :class="['relative min-h-0 flex-1']">
          <InteractiveArea ref="interactive-area" floating />
        </div>
      </div>
    </Transition>
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
  </div>
</template>

<style scoped>
/*
 * The chat folds into the bottom corner beside the character: bottom-right
 * when the chat is on the left of the character, bottom-left when it is on
 * the right.
 */
.chat-floating-fold-right-enter-active,
.chat-floating-fold-right-leave-active,
.chat-floating-fold-left-enter-active,
.chat-floating-fold-left-leave-active {
  transition:
    clip-path 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 380ms ease;
}

.chat-floating-fold-right-enter-active,
.chat-floating-fold-right-leave-active {
  transform-origin: bottom right;
}

.chat-floating-fold-left-enter-active,
.chat-floating-fold-left-leave-active {
  transform-origin: bottom left;
}

.chat-floating-fold-right-enter-from,
.chat-floating-fold-right-leave-to {
  clip-path: inset(100% 0 0 100% round 24px);
  transform: scale(0.94);
  opacity: 0;
}

.chat-floating-fold-left-enter-from,
.chat-floating-fold-left-leave-to {
  clip-path: inset(100% 100% 0 0 round 24px);
  transform: scale(0.94);
  opacity: 0;
}

.chat-floating-fold-right-enter-to,
.chat-floating-fold-right-leave-from,
.chat-floating-fold-left-enter-to,
.chat-floating-fold-left-leave-from {
  clip-path: inset(0 0 0 0 round 24px);
}

@media (prefers-reduced-motion: reduce) {
  .chat-floating-fold-right-enter-active,
  .chat-floating-fold-right-leave-active,
  .chat-floating-fold-left-enter-active,
  .chat-floating-fold-left-leave-active {
    transition: none;
  }
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
