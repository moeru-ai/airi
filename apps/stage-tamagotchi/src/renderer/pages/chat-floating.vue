<script setup lang="ts">
import type { ChatFloatingState } from '../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { GhostButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'

import {
  electronChatFloatingContentHidden,
  electronChatFloatingGetState,
  electronChatFloatingMoveBy,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
  electronChatWindowTakeDraft,
} from '../../shared/eventa'
import { useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'

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
const moveBy = useElectronEventaInvoke(electronChatFloatingMoveBy)
const takeDraft = useElectronEventaInvoke(electronChatWindowTakeDraft)

// The main process can emit before this page mounts, so the first state comes
// from the invoke and later ones from the event.
const stopStateChanged = getElectronEventaContext().on(electronChatFloatingStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopStateChanged)
onMounted(async () => {
  state.value = await getState()

  // A mode switch from the legacy window hands its unsent content to this one.
  const draft = await takeDraft()
  if (draft)
    await interactiveArea.value?.restoreDraft(draft)
})

useChatFloatingClickThrough({ pinned: () => state.value.pinned })

const freePlacement = computed(() => state.value.placement === 'free')
// The content stays mounted while it is hidden, so a fold or a move to the
// other side keeps the unsent draft, attachments and reply target.
const contentShown = computed(() => !state.value.folded && !state.value.relocating)

// The character stands on the other side of the chat: the chat folds toward
// it, and the resize grip sits away from it.
const characterOnLeft = computed(() => state.value.side === 'right')

interface WindowDelta {
  deltaX: number
  deltaY: number
}

/**
 * The screen position of the pointer held on a grip or handle, or `undefined`
 * when none is held. Pointer capture sends the moves to that element even
 * when the window lags behind the pointer, and screen coordinates stay valid
 * while the window moves under it.
 */
let heldPointer: { x: number, y: number } | undefined

function holdPointer(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  heldPointer = { x: event.screenX, y: event.screenY }
}

/** Sends the held pointer's movement to the main process, which moves or resizes the window. */
function dragHeldPointer(event: PointerEvent, applyDelta: (delta: WindowDelta) => unknown) {
  if (!heldPointer)
    return

  // Whole pixels only; the rounding remainder carries into the next move.
  const deltaX = Math.round(event.screenX - heldPointer.x)
  const deltaY = Math.round(event.screenY - heldPointer.y)
  if (deltaX === 0 && deltaY === 0)
    return

  heldPointer.x += deltaX
  heldPointer.y += deltaY
  void applyDelta({ deltaX, deltaY })
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
</script>

<template>
  <div
    :class="['relative h-full w-full']"
  >
    <Transition
      :name="characterOnLeft ? 'chat-floating-fold-left' : 'chat-floating-fold-right'"
      @after-leave="reportContentHidden()"
    >
      <div v-show="contentShown" :class="['absolute inset-0 flex flex-col gap-1 pt-3']">
        <div :class="['flex items-center gap-2 px-4', characterOnLeft ? 'flex-row-reverse' : '']">
          <div
            :class="[
              'chat-floating-island shrink-0 rounded-full p-0.5 shadow-md',
              'bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800',
            ]"
          >
            <GhostButton
              size="unset"
              :title="t('tamagotchi.stage.chat-window.resize')"
              :aria-label="t('tamagotchi.stage.chat-window.resize')"
              :class="[
                'size-8 touch-none rounded-full text-neutral-500 dark:text-neutral-400',
                characterOnLeft ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
              ]"
              @pointerdown="holdPointer"
              @pointermove="dragHeldPointer($event, resizeBy)"
              @lostpointercapture="releasePointer"
              @keydown="handleArrowKey($event, resizeBy)"
            >
              <div :class="[characterOnLeft ? 'i-solar:arrow-right-up-linear' : 'i-solar:arrow-left-up-linear', 'size-4']" />
            </GhostButton>
          </div>

          <div
            :class="[
              'chat-floating-island min-w-0 flex items-center gap-1 rounded-full p-1 shadow-md',
              'bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800',
            ]"
          >
            <GhostButton
              v-if="freePlacement"
              size="unset"
              :title="t('tamagotchi.stage.chat-window.move')"
              :aria-label="t('tamagotchi.stage.chat-window.move')"
              :class="['h-7 w-5 cursor-grab touch-none text-neutral-400']"
              @pointerdown="holdPointer"
              @pointermove="dragHeldPointer($event, moveBy)"
              @lostpointercapture="releasePointer"
              @keydown="handleArrowKey($event, moveBy)"
            >
              <div class="i-ph:dots-six-vertical-bold size-4" />
            </GhostButton>
            <GhostButton
              size="unset"
              :class="['min-w-0 gap-2 rounded-full px-2 py-0.5']"
              @click="sessionsDrawerOpen = true"
            >
              <div class="i-solar:chat-line-bold shrink-0 text-neutral-400 dark:text-neutral-500" />
              <span class="truncate text-sm">{{ activeCard?.name || 'AIRI' }}</span>
            </GhostButton>
            <ChatSpeechMuteButton />
            <ChatWindowStyleMenu :collect-draft="() => interactiveArea?.snapshotDraft()" />
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
 * The islands are round, so the hover and focus shapes of their buttons are
 * round too. The shared buttons keep the square corners they use in the
 * windowed title bar.
 */
.chat-floating-island :deep(button) {
  border-radius: 9999px;
}

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
