<script setup lang="ts">
import type { ResizeDirection } from '@proj-airi/electron-eventa'

import type { ChatFloatingState, ChatWindowPreferences } from '../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke, useElectronMouseAroundWindowBorder, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useDanmakuFeedExpiry } from '@proj-airi/stage-ui/composables/use-danmaku-feed-expiry'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useEventListener, useFocusWithin, useLocalStorage, useMutationObserver, usePreferredReducedMotion } from '@vueuse/core'
import { animate, createSpring } from 'animejs'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
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
  electronChatFloatingMoveTo,
  electronChatFloatingResizeBy,
  electronChatFloatingStateChanged,
  electronChatWindowSetPreferences,
} from '../../shared/eventa'
import { chatHeaderButtonClass } from '../components/chat-window/chat-header-button'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'
import { useWindowBackdrop } from '../composables/use-window-backdrop'
import { useControlsIslandStore } from '../stores/controls-island'

const backdropRoot = useTemplateRef<HTMLElement>('backdrop-root')

const { activeCard } = storeToRefs(useAiriCardStore())
const sessionsDrawerOpen = shallowRef(false)
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const { t } = useI18n()

// Folded until the main process answers, so the first unfold plays the same
// animation as every later one.
const state = shallowRef<ChatFloatingState>({ placement: 'attached', danmaku: false, side: 'left', resizeEdges: [], folded: true, relocating: false, pinned: false })
const getState = useElectronEventaInvoke(electronChatFloatingGetState)
const reportContentHidden = useElectronEventaInvoke(electronChatFloatingContentHidden)
const resizeBy = useElectronEventaInvoke(electronChatFloatingResizeBy)
const moveTo = useElectronEventaInvoke(electronChatFloatingMoveTo)
const foldChat = useElectronEventaInvoke(electronChatFloatingFold)
const setPreferences = useElectronEventaInvoke(electronChatWindowSetPreferences)

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

// A free chat stays where the user drags it.
const freePlacement = computed(() => state.value.placement === 'free')
const danmaku = computed(() => state.value.danmaku)
// The message feed has no glass. Its messages float over the desktop, so a
// feed that fades out leaves nothing behind.
useWindowBackdrop(backdropRoot, 'panel', () => !danmaku.value)
// The danmaku feed starts with its composer folded, because it is mostly read.
const composerFolded = useLocalStorage('chat-window/danmaku/composer-folded', true)
// Fade on hover, which the main window's controls island switches, turns the
// folded danmaku feed passive: the history only follows new messages, and it
// fades out and passes clicks through under the cursor. The header and the
// composer tab stay in control, and an unfolded composer pauses all of this.
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const passiveFeed = computed(() => danmaku.value && fadeOnHoverEnabled.value && composerFolded.value)
// The cursor comes from the main process, because a click-through window
// gets no mouse events.
const { isOutside: cursorOutsideHistory } = useElectronMouseInElement(computed(() => interactiveArea.value?.historyLayer))
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

// The message feed has no panel behind it, so a dock across the top would hang in the air. An attached feed stands
// its dock up along the side of the character instead. A free chat has no character beside it.
const verticalDock = computed(() => danmaku.value && state.value.placement === 'attached')

// A dock that stands up rests as a narrow bar, as the home indicator of a phone, and opens when the cursor comes near.
// The zone around it is transparent, so the page lets clicks through there. The main process reports where the cursor is.
const dockZone = useTemplateRef<HTMLElement>('dock-zone')
const { isOutside: cursorAwayFromDock } = useElectronMouseInElement(dockZone)
const cursorNearDock = computed(() => !cursorAwayFromDock.value)
// The dock waits a moment before it closes, so a cursor that slips off its edge does not make it flicker.
const cursorNearDockLately = refDebounced(cursorNearDock, 400)
const { focused: focusInDock } = useFocusWithin(dockZone)
// Only keyboard focus keeps the dock open. A click leaves the focus on its button, and the dock still closes when the cursor leaves.
const dockFocused = computed(() => focusInDock.value && document.activeElement?.matches(':focus-visible') === true)
// A menu of the dock opens over the page, away from the dock. The dock stays open while the trigger of a menu is open.
const dockMenuOpen = shallowRef(false)
useMutationObserver(dockZone, () => {
  dockMenuOpen.value = dockZone.value?.querySelector('[data-state="open"]') != null
}, { subtree: true, attributes: true, attributeFilter: ['data-state'] })
const dockOpen = computed(() => !verticalDock.value || cursorNearDock.value || cursorNearDockLately.value || dockFocused.value || dockMenuOpen.value)

const dockElement = useTemplateRef<HTMLElement>('dock')
/**
 * The bar of a closed dock: 3px wide and 56px tall, at the middle of the dock, on its side of the window edge.
 * The dock stands 10px from the edge, just past the hover scrollbar, so the bar sits between the scrollbar and the messages.
 */
const DOCK_BAR = { width: 3, height: 56, edgeInset: 0 }
const DOCK_OPEN_CLIP = 'inset(0px 0px 0px 0px round 999px)'

/** The clip that leaves only the bar of the dock. */
function dockBarClip(dock: HTMLElement) {
  const along = (dock.offsetHeight - DOCK_BAR.height) / 2
  const across = dock.offsetWidth - DOCK_BAR.edgeInset - DOCK_BAR.width
  const [left, right] = characterOnLeft.value ? [DOCK_BAR.edgeInset, across] : [across, DOCK_BAR.edgeInset]
  return `inset(${along}px ${right}px ${along}px ${left}px round 999px)`
}

/** The items of the dock in their order along it: the buttons, the separator, and the buttons of the group. */
function dockItems(dock: HTMLElement) {
  return [...dock.children].flatMap(child => child.tagName === 'DIV' && child.childElementCount > 0 ? [...child.children] : [child]) as HTMLElement[]
}

let dockAnimations: Array<ReturnType<typeof animate>> = []

/**
 * Turns the dock into its bar and back. The bar is the dock itself under a clip, so opening grows the same white shape
 * out of the bar, and the items fade in together once the shape is nearly open. They do not move, so the column stays
 * straight. Closing fades the items first and then draws the shape back into the bar.
 */
watch([verticalDock, dockOpen], async ([vertical, open], previous) => {
  await nextTick()
  const dock = dockElement.value
  if (!dock)
    return
  dockAnimations.forEach(animation => animation.pause())
  dockAnimations = []
  const items = dockItems(dock)
  // A dock across the top has no bar.
  if (!vertical) {
    dock.style.removeProperty('clip-path')
    items.forEach((item) => {
      item.style.removeProperty('opacity')
      item.style.removeProperty('transform')
    })
    return
  }
  // The items never move. A transform left by an animation that stopped early would shift them.
  items.forEach(item => item.style.removeProperty('transform'))
  const target = open ? DOCK_OPEN_CLIP : dockBarClip(dock)
  // A dock that only now stands up, or a reduced motion, takes the state at once.
  if (!previous?.[0] || reducedMotion.value === 'reduce') {
    dock.style.clipPath = target
    items.forEach(item => item.style.opacity = open ? '' : '0')
    return
  }
  const from = dock.style.clipPath || DOCK_OPEN_CLIP
  if (open) {
    dockAnimations.push(animate(dock, { clipPath: [from, target], ease: ISLAND_SPRING }))
    dockAnimations.push(animate(items, { opacity: [0, 1], duration: 160, delay: 120, ease: 'outQuad' }))
  }
  else {
    dockAnimations.push(animate(items, { opacity: 0, duration: 100, ease: 'inQuad' }))
    dockAnimations.push(animate(dock, { clipPath: [from, target], duration: 300, delay: 60, ease: 'inOutQuad' }))
  }
}, { immediate: true })

/**
 * How far the island moves to sit under the dock: past the gap and its own size, toward the dock.
 * A dock across the top has the island beside it. A dock that stands up has the island below it.
 */
function underDock(island: HTMLElement): ['x' | 'y', number] {
  if (verticalDock.value)
    return ['y', -(ISLAND_GAP + island.offsetHeight)]
  const towardDock = characterOnLeft.value ? 1 : -1
  return ['x', towardDock * (ISLAND_GAP + island.offsetWidth)]
}

/** The island starts small under the edge of the dock and springs out to its place. */
function budIsland(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  const island = el as HTMLElement
  const [axis, offset] = underDock(island)
  // Under a dock that stands up, the island waits until the dock has grown out of its bar. It stays clear while it waits.
  animate(island, { [axis]: { from: offset }, scale: { from: 0.4 }, opacity: { from: 0 }, delay: verticalDock.value ? 160 : 0, ease: ISLAND_SPRING, onComplete: () => done() })
}

/** The island shrinks and slides back under the dock, which takes it in. */
function mergeIsland(el: Element, done: () => void) {
  if (reducedMotion.value === 'reduce')
    return done()
  const island = el as HTMLElement
  const [axis, offset] = underDock(island)
  animate(island, { [axis]: offset, scale: 0.4, duration: 220, ease: 'inQuad', onComplete: () => done() })
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
} = useElectronMouseAroundWindowBorder({ threshold: 10 })
const nearResizeEdge = computed(() => {
  const edges = state.value.resizeEdges
  return (edges.includes('n') && nearTop.value)
    || (edges.includes('s') && nearBottom.value)
    || (edges.includes('w') && nearLeft.value)
    || (edges.includes('e') && nearRight.value)
})
const nearResizeEdgeFor250Ms = refDebounced(nearResizeEdge, 250)

/** Where each resize handle sits: a band along each edge, and a square in each corner, over the bands. */
const resizeHandleClasses: Record<ResizeDirection, string[]> = {
  n: ['left-[5px] right-[5px] top-0 h-[5px]', 'cursor-n-resize'],
  s: ['left-[5px] right-[5px] bottom-0 h-[5px]', 'cursor-s-resize'],
  e: ['top-[5px] bottom-[5px] right-0 w-[5px]', 'cursor-e-resize'],
  w: ['top-[5px] bottom-[5px] left-0 w-[5px]', 'cursor-w-resize'],
  ne: ['right-0 top-0 size-[10px]', 'cursor-ne-resize'],
  nw: ['left-0 top-0 size-[10px]', 'cursor-nw-resize'],
  se: ['right-0 bottom-0 size-[10px]', 'cursor-se-resize'],
  sw: ['left-0 bottom-0 size-[10px]', 'cursor-sw-resize'],
}
/** The handles of the chat, the edges first, so a corner sits over the ends of its two edges. */
const resizeHandles = computed(() => [...state.value.resizeEdges].sort((a, b) => a.length - b.length))

type ResizeCorner = Extract<ResizeDirection, 'ne' | 'nw' | 'se' | 'sw'>

function isResizeCorner(direction: ResizeDirection): direction is ResizeCorner {
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

interface WindowDelta {
  deltaX: number
  deltaY: number
}

/**
 * A press on a resize handle or the drag handle, in screen pixels, which stay
 * valid while the window moves under the pointer. Pointer capture sends the
 * moves to the pressed element even when the window lags behind the pointer.
 */
interface HeldPointer {
  /** The pressed handle, which holds the pointer capture. */
  element: HTMLElement
  /** The edge or the corner that a resize handle moves. The drag handle has none. */
  direction?: ResizeDirection
  pointerId: number
  pressX: number
  pressY: number
  /** Window position when the press started. */
  windowX: number
  windowY: number
  /** Pointer movement already sent as resize steps. */
  resizedX: number
  resizedY: number
}

/** `undefined` when no handle is held. */
let heldPointer: HeldPointer | undefined

function holdPointer(event: PointerEvent, direction?: ResizeDirection) {
  const element = event.currentTarget as HTMLElement
  element.setPointerCapture(event.pointerId)
  heldPointer = {
    element,
    direction,
    pointerId: event.pointerId,
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
  const held = pointerStillHeld(event)
  if (!held?.direction)
    return

  // Whole pixels only; the rounding remainder carries into the next step.
  const deltaX = Math.round(event.screenX - held.pressX) - held.resizedX
  const deltaY = Math.round(event.screenY - held.pressY) - held.resizedY
  if (deltaX === 0 && deltaY === 0)
    return

  held.resizedX += deltaX
  held.resizedY += deltaY
  void resizeBy({ deltaX, deltaY, direction: held.direction })
}

/**
 * Asks for the window position that the pointer movement since the press
 * gives. It is measured from the press, not from the window: a screen edge
 * can stop the window, and a drag that goes on must still reach the next
 * display.
 */
function moveWithHeldPointer(event: PointerEvent) {
  const held = pointerStillHeld(event)
  if (!held)
    return

  void moveTo({
    x: Math.round(held.windowX + event.screenX - held.pressX),
    y: Math.round(held.windowY + event.screenY - held.pressY),
  })
}

// Capture ends on release, cancel or removal of the element alike. A hold
// that ends without them gives the capture back here.
function releasePointer() {
  if (heldPointer?.element.hasPointerCapture(heldPointer.pointerId))
    heldPointer.element.releasePointerCapture(heldPointer.pointerId)
  heldPointer = undefined
}

/**
 * The held press, or `undefined` once the buttons are up.
 *
 * A release can miss this window, for example while another window takes the
 * pointer. A resize handle would then stay held, and the mouse moves that
 * reach this window while the main window is dragged would resize the chat. A
 * move with no button down ends the hold instead.
 */
function pointerStillHeld(event: PointerEvent) {
  if (heldPointer && event.buttons === 0)
    releasePointer()
  return heldPointer
}

// A window that loses focus has no press left in it.
useEventListener(window, 'blur', releasePointer)

/** Keyboard step for the drag handle and the resize corners, in screen pixels. */
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
      @after-enter="hitTest()"
      @after-leave="reportContentHidden()"
    >
      <div
        v-show="contentShown"
        ref="backdrop-root"
        data-window-backdrop-surface
        data-window-backdrop-floating-background
        :class="['absolute inset-0 flex flex-col gap-1 rounded-3xl pt-3']"
      >
        <!--
          The dock sits on the side away from the character. A character on the left mirrors the row and the dock, so
          the fold button stays at the outer end. A dock that stands up sits at the middle of the side of the character,
          with the island of the feed below it. Closed, it shrinks into a narrow bar. The dock stands 10px from the window
          edge, past the 10px hover scrollbar there, so it never covers the scrollbar. Its 16px padding on the other
          sides is the zone where the cursor opens it, so the scrollbar never opens it. The zone takes no pointer, so the
          history under it still takes hover, wheel, and clicks.
        -->
        <div
          ref="dock-zone"
          :class="verticalDock
            ? ['pointer-events-none absolute top-1/2 z-10 w-12 flex flex-col items-center gap-2 py-4 -translate-y-1/2', characterOnLeft ? 'left-2.5 pr-4' : 'right-2.5 pl-4']
            : ['flex items-center gap-2 px-4', characterOnLeft ? 'flex-row-reverse' : '']"
        >
          <!--
            The dock stays over the island, so the island can hide under its edge. A dock that stands up draws its
            shadow on this wrapper, because the clip that turns it into its bar would cut a box shadow.
          -->
          <div :class="['relative z-1 min-w-0', verticalDock ? 'drop-shadow-md' : '']">
            <div
              ref="dock"
              :class="[
                'pointer-events-auto min-w-0 flex items-center gap-1 rounded-full p-0.5',
                'bg-white dark:bg-neutral-900',
                verticalDock ? 'flex-col' : ['shadow-md', characterOnLeft ? 'flex-row-reverse' : ''],
              ]"
            >
              <button
                :title="t('tamagotchi.stage.chat-window.fold')"
                :aria-label="t('tamagotchi.stage.chat-window.fold')"
                :class="['shrink-0', chatHeaderButtonClass('dock')]"
                @click="foldChat()"
              >
                <div class="i-lucide:minimize-2 size-4" />
              </button>
              <button
                v-if="freePlacement"
                :title="t('tamagotchi.stage.chat-window.move')"
                :aria-label="t('tamagotchi.stage.chat-window.move')"
                :class="[
                  'h-7 w-5 shrink-0 cursor-grab touch-none rounded-full',
                  'flex items-center justify-center outline-none transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                  'text-neutral-400 hover:bg-neutral-200 dark:text-neutral-500 dark:hover:bg-neutral-800',
                ]"
                @pointerdown="holdPointer"
                @pointermove="moveWithHeldPointer"
                @lostpointercapture="releasePointer"
                @keydown="handleArrowKey($event, moveByKeyboard)"
              >
                <div class="i-ph:dots-six-vertical-bold size-4" />
              </button>
              <!--
              A plain button: GhostButton wraps its slot in a span that cannot shrink, so a long name could not truncate.
              A dock that stands up has no room for the name, so the name moves to the tooltip.
            -->
              <button
                :title="verticalDock ? activeCard?.name || 'AIRI' : undefined"
                :aria-label="verticalDock ? activeCard?.name || 'AIRI' : undefined"
                :class="[
                  'group min-w-0 flex items-center gap-1.5 rounded-full outline-none transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                  'text-neutral-700 hover:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-800',
                  verticalDock ? 'p-0.5' : characterOnLeft ? 'flex-row-reverse py-0.5 pl-2 pr-0.5' : 'py-0.5 pl-0.5 pr-2',
                ]"
                @click="sessionsDrawerOpen = true"
              >
                <!-- The icon looks like the dock icons beside it: light gray, no disc. Hover shows the background of the button. -->
                <span
                  :class="[
                    'size-6 shrink-0',
                    'flex items-center justify-center text-base transition-colors',
                    'text-neutral-400 dark:text-neutral-500',
                  ]"
                >
                  <span class="i-solar:chat-line-bold" />
                </span>
                <span v-if="!verticalDock" class="truncate text-sm font-medium">{{ activeCard?.name || 'AIRI' }}</span>
              </button>
              <div :class="[verticalDock ? 'my-0.5 h-px w-4' : 'mx-0.5 h-4 w-px', 'shrink-0', 'bg-neutral-200 dark:bg-neutral-700']" />
              <div :class="['flex shrink-0 items-center gap-0.5', verticalDock ? 'flex-col' : characterOnLeft ? 'flex-row-reverse' : '']">
                <ChatSpeechMuteButton variant="dock" />
                <button
                  :class="chatHeaderButtonClass('dock', danmaku)"
                  :title="t('tamagotchi.stage.chat-window.danmaku')"
                  :aria-label="t('tamagotchi.stage.chat-window.danmaku')"
                  :aria-pressed="danmaku"
                  @click="toggleDanmaku"
                >
                  <div class="i-solar:subtitles-bold-duotone" />
                </button>
                <button
                  :class="chatHeaderButtonClass('dock', state.pinned)"
                  :title="t('tamagotchi.stage.chat-window.pin')"
                  :aria-label="t('tamagotchi.stage.chat-window.pin')"
                  :aria-pressed="state.pinned"
                  @click="togglePinned"
                >
                  <div :class="state.pinned ? 'i-solar:pin-bold-duotone' : 'i-solar:pin-linear'" />
                </button>
                <ChatWindowStyleMenu variant="dock" />
              </div>
            </div>
          </div>
          <!--
            The settings of the message feed are an island of their own while the feed is on. It buds off the dock on
            the side that leaves the dock in place, and goes back under the dock when the feed turns off.
          -->
          <Transition :css="false" @enter="budIsland" @leave="mergeIsland">
            <div
              v-if="danmaku && dockOpen"
              :class="[
                'pointer-events-auto relative z-0 shrink-0 rounded-full p-0.5 shadow-md',
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
            :dock-side="verticalDock && dockOpen ? (characterOnLeft ? 'left' : 'right') : undefined"
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
          @pointerdown="holdPointer($event, edge)"
          @pointermove="resizeWithHeldPointer"
          @lostpointercapture="releasePointer"
          @keydown="handleArrowKey($event, (delta: WindowDelta) => resizeBy({ ...delta, direction: edge }))"
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
