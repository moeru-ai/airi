<script setup lang="ts">
import type { ResizeEdge } from '@gd-kirie/platform'

import type { ChatFloatingDelta, ChatFloatingResizeEdge, ChatFloatingState, ChatWindowPreferences } from '../../shared/eventa'

import { getHostEventaContext, useHostEventaInvoke, useHostMouseAroundWindowBorder, useHostMouseInElement, useHostWindowMove, useHostWindowResize } from '@proj-airi/stage-host-context'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useLocalStorage, usePreferredReducedMotion } from '@vueuse/core'
import { animate, createSpring } from 'animejs'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatDanmakuFeedMenu from '../components/chat-window/chat-danmaku-feed-menu.vue'
import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/InteractiveArea.vue'
import WindowResizeBorder from '../components/window-resize-border.vue'

import {
  electronChatFloatingContentHidden,
  electronChatFloatingFold,
  electronChatFloatingGetState,
  electronChatFloatingMoveBy,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
  electronChatWindowSetPreferences,
} from '../../shared/eventa'
import { chatHeaderButtonClass } from '../components/chat-window/chat-header-button'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'
import { useDanmakuFeedExpiry } from '../composables/use-danmaku-feed-expiry'
import { useControlsIslandStore } from '../stores/controls-island'

const { activeCard } = storeToRefs(useAiriCardStore())
const sessionsDrawerOpen = shallowRef(false)
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const { t } = useI18n()

// Folded until the host answers, so the first unfold plays the same animation
// as every later one.
const state = shallowRef<ChatFloatingState>({ placement: 'attached', danmaku: false, side: 'left', resizeEdges: [], folded: true, relocating: false, pinned: false })
const getState = useHostEventaInvoke(electronChatFloatingGetState)
const reportContentHidden = useHostEventaInvoke(electronChatFloatingContentHidden)
const resizeBy = useHostEventaInvoke(electronChatFloatingResizeBy)
const moveBy = useHostEventaInvoke(electronChatFloatingMoveBy)
const foldChat = useHostEventaInvoke(electronChatFloatingFold)
const setPreferences = useHostEventaInvoke(electronChatWindowSetPreferences)
const { beginMove } = useHostWindowMove()
const beginResize = useHostWindowResize()

// The host can emit before this page mounts, so the first state comes from
// the invoke and later ones from the event.
const stopStateChanged = getHostEventaContext().on(electronChatFloatingStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopStateChanged)
onMounted(async () => {
  state.value = await getState({})
})

function reportHidden() {
  void reportContentHidden({}).catch(error => console.error('[chat-floating] Failed to report the folded content:', error))
}

// A free chat stays where the user drags it.
const freePlacement = computed(() => state.value.placement === 'free')
const danmaku = computed(() => state.value.danmaku)
// The danmaku feed starts with its composer folded, because it is mostly read.
const composerFolded = useLocalStorage('chat-window/danmaku/composer-folded', true)
// Fade on hover, which the main window's controls island switches, turns the
// folded danmaku feed passive: the history only follows new messages, and it
// fades out and passes clicks through under the cursor. The header and the
// composer tab stay in control, and an unfolded composer pauses all of this.
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const passiveFeed = computed(() => danmaku.value && fadeOnHoverEnabled.value && composerFolded.value)
// The cursor comes from the host, because a click-through window gets no
// mouse events.
const { isOutside: cursorOutsideHistory } = useHostMouseInElement(computed(() => interactiveArea.value?.historyLayer))
// The folded danmaku feed hides read messages. They come back while the
// cursor is over the feed, like notifications, and while the composer is
// unfolded, so the history stays in reach. A passive feed fades out under
// the cursor instead, so there the cursor does not bring them back.
const expireMessages = computed(() => composerFolded.value && (passiveFeed.value || cursorOutsideHistory.value))
const expiredBefore = useDanmakuFeedExpiry(danmaku, expireMessages)
const { hitTest } = useChatFloatingClickThrough({
  pinned: () => state.value.pinned,
  passiveArea: () => passiveFeed.value ? interactiveArea.value?.historyLayer : undefined,
})
// The content stays mounted while it is hidden, so a fold or a move to the
// other side keeps the unsent draft, attachments and reply target.
const contentShown = computed(() => !state.value.folded && !state.value.relocating)
// Menus and dialogs close as the content hides, so they neither stay on
// screen during the fold nor come back with the next unfold.
watch(contentShown, (shown) => {
  if (!shown)
    void dismissOverlays()
})

// The character stands on the other side of the chat, and the chat folds
// toward it. The dock sits on the other side.
const characterOnLeft = computed(() => state.value.side === 'right')

function savePreference(changes: Partial<ChatWindowPreferences>) {
  void setPreferences(changes).catch(error => console.error('[chat-floating] Failed to save the chat preferences:', error))
}

/** The space between the dock and the island beside it, in pixels. It matches the `gap-2` of their row. */
const ISLAND_GAP = 8
// The island buds off the dock like a bubble: the spring carries it a little past its place and lets it settle.
const ISLAND_SPRING = createSpring({ bounce: 0.45, duration: 520 })
const reducedMotion = usePreferredReducedMotion()

/** How far the island moves to sit under the dock: past the gap and its own width, toward the dock. */
function underDock(island: HTMLElement) {
  const towardDock = characterOnLeft.value ? 1 : -1
  return towardDock * (ISLAND_GAP + island.offsetWidth)
}

/** The island starts small under the edge of the dock and springs out to its place. */
function budIsland(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  const island = el as HTMLElement
  animate(island, { x: { from: underDock(island) }, scale: { from: 0.4 }, ease: ISLAND_SPRING, onComplete: () => done() })
}

/** The island shrinks and slides back under the dock, which takes it in. */
function mergeIsland(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  const island = el as HTMLElement
  animate(island, { x: underDock(island), scale: 0.4, duration: 220, ease: 'inQuad', onComplete: () => done() })
}

function toggleDanmaku() {
  savePreference({ danmaku: !state.value.danmaku })
}

// An attached chat takes the pin of the main window, so its pin button pins
// the main window, through the setting that the Controls Island pin also
// changes. A free chat has a pin of its own.
const { alwaysOnTop } = storeToRefs(useSettings())
function togglePinned() {
  if (state.value.placement === 'attached')
    alwaysOnTop.value = !state.value.pinned
  else
    savePreference({ pinned: !state.value.pinned })
}

// The edges flash while the cursor is near one that resizes the chat, like
// the edges of the main window.
const {
  nearTop,
  nearBottom,
  nearLeft,
  nearRight,
} = useHostMouseAroundWindowBorder({ threshold: 10 })
const nearResizeEdge = computed(() => {
  const edges = state.value.resizeEdges
  return (edges.includes('n') && nearTop.value)
    || (edges.includes('s') && nearBottom.value)
    || (edges.includes('w') && nearLeft.value)
    || (edges.includes('e') && nearRight.value)
})
const nearResizeEdgeFor250Ms = refDebounced(nearResizeEdge, 250)

/** Where each resize handle sits: a band along each edge, and a square in each corner, over the bands. */
const resizeHandleClasses: Record<ChatFloatingResizeEdge, string[]> = {
  n: ['left-[5px] right-[5px] top-0 h-[5px]', 'cursor-n-resize'],
  s: ['left-[5px] right-[5px] bottom-0 h-[5px]', 'cursor-s-resize'],
  e: ['top-[5px] bottom-[5px] right-0 w-[5px]', 'cursor-e-resize'],
  w: ['top-[5px] bottom-[5px] left-0 w-[5px]', 'cursor-w-resize'],
  ne: ['right-0 top-0 size-[10px]', 'cursor-ne-resize'],
  nw: ['left-0 top-0 size-[10px]', 'cursor-nw-resize'],
  se: ['right-0 bottom-0 size-[10px]', 'cursor-se-resize'],
  sw: ['left-0 bottom-0 size-[10px]', 'cursor-sw-resize'],
}
/** The native resize edge of each handle. */
const nativeResizeEdges: Record<ChatFloatingResizeEdge, ResizeEdge> = {
  n: 'top',
  s: 'bottom',
  e: 'right',
  w: 'left',
  ne: 'top-right',
  nw: 'top-left',
  se: 'bottom-right',
  sw: 'bottom-left',
}
/** The handles of the chat, the edges first, so a corner sits over the ends of its two edges. */
const resizeHandles = computed(() => [...state.value.resizeEdges].sort((a, b) => a.length - b.length))

type ResizeCorner = Extract<ChatFloatingResizeEdge, 'ne' | 'nw' | 'se' | 'sw'>

function isResizeCorner(direction: ChatFloatingResizeEdge): direction is ResizeCorner {
  return direction.length === 2
}

// A corner moves both edges that meet there, so the corners also resize from
// the keyboard, and each one names its corner.
const resizeCornerLabels = computed<Record<ResizeCorner, string>>(() => ({
  ne: t('tamagotchi.stage.chat-window.resize-corner.ne'),
  nw: t('tamagotchi.stage.chat-window.resize-corner.nw'),
  se: t('tamagotchi.stage.chat-window.resize-corner.se'),
  sw: t('tamagotchi.stage.chat-window.resize-corner.sw'),
}))

// The native window gestures follow the pointer outside the window too, and
// the window manager keeps the window on a display.
function startMove(event: PointerEvent) {
  if (event.button !== 0)
    return
  void beginMove().catch(error => console.error('[chat-floating] Failed to begin moving the chat:', error))
}

function startResize(event: PointerEvent, edge: ChatFloatingResizeEdge) {
  if (event.button !== 0)
    return
  void beginResize(nativeResizeEdges[edge]).catch(error => console.error('[chat-floating] Failed to begin resizing the chat:', error))
}

/** Keyboard step for the drag handle and the resize corners, in CSS pixels. */
const keyboardStep = 16

/** Moves or resizes the window from the arrow keys. */
function handleArrowKey(event: KeyboardEvent, applyDelta: (delta: ChatFloatingDelta) => Promise<void>) {
  const step = event.shiftKey ? keyboardStep * 4 : keyboardStep
  const deltas: Record<string, ChatFloatingDelta> = {
    ArrowLeft: { deltaX: -step, deltaY: 0 },
    ArrowRight: { deltaX: step, deltaY: 0 },
    ArrowUp: { deltaX: 0, deltaY: -step },
    ArrowDown: { deltaX: 0, deltaY: step },
  }
  const delta = deltas[event.key]
  if (!delta)
    return

  event.preventDefault()
  void applyDelta(delta).catch(error => console.error('[chat-floating] Failed to move or resize the chat:', error))
}
</script>

<template>
  <div
    :class="['relative h-full w-full']"
  >
    <Transition
      :name="characterOnLeft ? 'chat-floating-fold-left' : 'chat-floating-fold-right'"
      @after-enter="hitTest()"
      @after-leave="reportHidden()"
    >
      <div
        v-show="contentShown"
        :class="['absolute inset-0 flex flex-col gap-1 rounded-3xl pt-3']"
      >
        <!--
          The dock sits on the side away from the character. A character on the left mirrors the row and the dock, so
          the fold button stays at the outer end.
        -->
        <div :class="['flex items-center gap-2 px-4', characterOnLeft ? 'flex-row-reverse' : '']">
          <!-- The dock stays over the island, so the island can hide under its edge. -->
          <div
            :class="[
              'relative z-1 min-w-0 flex items-center gap-1 rounded-full p-0.5 shadow-md',
              'bg-white dark:bg-neutral-900',
              characterOnLeft ? 'flex-row-reverse' : '',
            ]"
          >
            <button
              :title="t('tamagotchi.stage.chat-window.fold')"
              :aria-label="t('tamagotchi.stage.chat-window.fold')"
              :class="['shrink-0', chatHeaderButtonClass('dock')]"
              @click="foldChat({})"
            >
              <div :class="['i-lucide:minimize-2 size-4']" />
            </button>
            <button
              v-if="freePlacement"
              :title="t('tamagotchi.stage.chat-window.move')"
              :aria-label="t('tamagotchi.stage.chat-window.move')"
              :class="[
                'h-7 w-5 shrink-0 cursor-grab touch-none rounded-full',
                'flex items-center justify-center outline-none transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                'text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
              ]"
              @pointerdown="startMove"
              @keydown="handleArrowKey($event, moveBy)"
            >
              <div :class="['i-ph:dots-six-vertical-bold size-4']" />
            </button>
            <!-- A plain button: GhostButton wraps its slot in a span that cannot shrink, so a long name could not truncate. -->
            <button
              :class="[
                'group min-w-0 flex items-center gap-1.5 rounded-full py-0.5 outline-none transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                'text-neutral-700 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
                characterOnLeft ? 'flex-row-reverse pl-2 pr-0.5' : 'pl-0.5 pr-2',
              ]"
              @click="sessionsDrawerOpen = true"
            >
              <!-- The icon looks like the dock icons beside it: light gray at rest, the theme color on hover, no disc. -->
              <span
                :class="[
                  'size-6 shrink-0',
                  'flex items-center justify-center text-base transition-colors',
                  'text-neutral-400 group-hover:text-primary-500 dark:text-neutral-500 dark:group-hover:text-primary-400',
                ]"
              >
                <span :class="['i-solar:chat-line-bold']" />
              </span>
              <span :class="['truncate text-sm font-medium']">{{ activeCard?.name || 'AIRI' }}</span>
            </button>
            <div :class="['mx-0.5 h-4 w-px shrink-0', 'bg-neutral-200 dark:bg-neutral-700']" />
            <div :class="['flex shrink-0 items-center gap-0.5', characterOnLeft ? 'flex-row-reverse' : '']">
              <ChatSpeechMuteButton variant="dock" />
              <button
                :class="chatHeaderButtonClass('dock', danmaku)"
                :title="t('tamagotchi.stage.chat-window.danmaku')"
                :aria-label="t('tamagotchi.stage.chat-window.danmaku')"
                :aria-pressed="danmaku"
                @click="toggleDanmaku"
              >
                <div :class="['i-solar:subtitles-bold-duotone']" />
              </button>
              <button
                :class="chatHeaderButtonClass('dock', state.pinned)"
                :title="t('tamagotchi.stage.chat-window.pin')"
                :aria-label="t('tamagotchi.stage.chat-window.pin')"
                :aria-pressed="state.pinned"
                @click="togglePinned"
              >
                <div :class="[state.pinned ? 'i-solar:pin-bold-duotone' : 'i-solar:pin-linear']" />
              </button>
              <ChatWindowStyleMenu variant="dock" />
            </div>
          </div>
          <!--
            The settings of the message feed are an island of their own while the feed is on. It buds off the dock on
            the side that leaves the dock in place, and goes back under the dock when the feed turns off.
          -->
          <Transition :css="false" @enter="budIsland" @leave="mergeIsland">
            <div
              v-if="danmaku"
              :class="[
                'relative z-0 shrink-0 rounded-full p-0.5 shadow-md',
                'bg-white dark:bg-neutral-900',
              ]"
            >
              <ChatDanmakuFeedMenu variant="dock" />
            </div>
          </Transition>
        </div>

        <div :class="['relative min-h-0 flex-1']">
          <InteractiveArea
            ref="interactive-area"
            v-model:composer-folded="composerFolded"
            floating
            :composer-foldable="danmaku"
            :passive="passiveFeed"
            :expired-before="expiredBefore"
          />
        </div>
        <!--
          The corners are buttons that take keyboard focus and the arrow keys. The edges take only the pointer. The
          handles paint nothing, so they mark that the window takes the pointer over them.
        -->
        <component
          :is="isResizeCorner(edge) ? 'button' : 'div'"
          v-for="edge in resizeHandles"
          :key="edge"
          data-takes-pointer
          :aria-label="isResizeCorner(edge) ? resizeCornerLabels[edge] : undefined"
          :class="[
            'absolute z-1000 touch-none outline-none',
            isResizeCorner(edge) ? 'rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300' : '',
            resizeHandleClasses[edge],
          ]"
          @pointerdown="startResize($event, edge)"
          @keydown="handleArrowKey($event, (delta: ChatFloatingDelta) => resizeBy({ ...delta, direction: edge }))"
        />
        <WindowResizeBorder :shown="nearResizeEdge || nearResizeEdgeFor250Ms" :class="['rounded-3xl']" />
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
