<script setup lang="ts">
import type { ResizeDirection } from '@proj-airi/electron-eventa'
import type { TooltipContentProps } from 'reka-ui'

import type { ChatFloatingState, ChatWindowPreferences } from '../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke, useElectronMouseAroundWindowBorder, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useDanmakuFeedExpiry } from '@proj-airi/stage-ui/composables/use-danmaku-feed-expiry'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Dock, DockButton, dockItemClasses, DockSeparator, Tooltip, TransitionBud } from '@proj-airi/ui'
import { refDebounced, useElementSize, useEventListener, useFocusWithin, useLocalStorage, useMutationObserver, usePreferredReducedMotion } from '@vueuse/core'
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
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'
import { useControlsIslandStore } from '../stores/controls-island'

const panel = useTemplateRef<HTMLElement>('panel')

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
// The message feed has no glass and no fill. Its messages float over the
// desktop, so a feed that fades out leaves nothing behind.
useBackdropSurface(panel, { enabled: () => !danmaku.value })
// The window draws native glass only on macOS. See `services/electron/window-backdrop.ts`.
const glassBackdrop = computed(() => isElectronWindow(window) && window.platform === 'darwin' && !danmaku.value)
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

// NOTICE:
// Activation puts back the focus from before. Else the first dock button shows a focus ring and tooltip.
// On macOS, `attachToMain` changes the parent window on focus and blur, and Chromium then focuses that button.
// Measured with Electron 43.8.4.
// Removal condition: Electron keeps the focus across a parent change.
let focusedBeforeBlur = document.activeElement
// The focus comes back with its focus ring only if it had one, as after the Tab key. `:focus-visible` stops matching
// once the window blurs, so the focus ring is read when the focus arrives.
let focusRing = false
let focusRingBeforeBlur = false
useEventListener(document, 'focusin', event => focusRing = event.target instanceof Element && event.target.matches(':focus-visible'), { capture: true })
useEventListener(window, 'blur', () => {
  focusedBeforeBlur = document.activeElement
  focusRingBeforeBlur = focusRing
})
useEventListener(window, 'focus', () => {
  const focused = document.activeElement
  if (focused === focusedBeforeBlur)
    return
  if (focusedBeforeBlur instanceof HTMLElement && focusedBeforeBlur !== document.body && focusedBeforeBlur.isConnected)
    focusedBeforeBlur.focus({ preventScroll: true, focusVisible: focusRingBeforeBlur })
  else if (focused instanceof HTMLElement)
    focused.blur()
})

// The character stands on the other side of the chat, and the chat folds
// toward it. The dock sits on the other side.
const characterOnLeft = computed(() => state.value.side === 'right')

function savePreference(changes: Partial<ChatWindowPreferences>) {
  void setPreferences(changes).catch(error => console.error('[chat-floating] Failed to save the chat preferences:', error))
}

// A dock that stands up opens out of its bar with the spring that `TransitionBud` gives its island.
const ISLAND_SPRING = createSpring({ bounce: 0.45, duration: 520 })
const reducedMotion = usePreferredReducedMotion()

// The message feed has no panel behind it, so a dock across the top would hang in the air. An attached feed stands
// its dock up along the side of the character instead. A free chat has no character beside it.
const verticalDock = computed(() => danmaku.value && state.value.placement === 'attached')

// A dock that stands up rests as a narrow bar, as the home indicator of a phone, and opens when the cursor reaches the
// bar. The zone around it is transparent, so the page lets clicks through there. The main process reports where the
// cursor is.
const dockZone = useTemplateRef<HTMLElement>('dock-zone')
const { isOutside: cursorAwayFromDock } = useElectronMouseInElement(dockZone)
const cursorNearDock = shallowRef(false)
// The dock waits a moment before it closes, so a cursor that slips off its edge does not make it flicker.
const cursorNearDockLately = refDebounced(cursorNearDock, 400)
const { focused: focusInDock } = useFocusWithin(dockZone)
// Only keyboard focus keeps the dock open. A click leaves the focus on its button, and the dock still closes when the
// cursor leaves. The last input decides, as for `:focus-visible`. It is reactive, so a later click lets the dock close.
const keyboardInput = shallowRef(false)
useEventListener(window, 'keydown', () => keyboardInput.value = true, { capture: true, passive: true })
useEventListener(window, 'pointerdown', () => keyboardInput.value = false, { capture: true, passive: true })
const dockFocused = computed(() => focusInDock.value && keyboardInput.value)
// A menu of the dock opens over the page, away from the dock. The dock stays open while the trigger of a menu is open.
// The trigger tells it by `aria-expanded`. Its `data-state` can be the state of its tooltip.
const dockMenuOpen = shallowRef(false)
useMutationObserver(dockZone, () => {
  dockMenuOpen.value = dockZone.value?.querySelector('[aria-expanded="true"]') != null
}, { subtree: true, attributes: true, attributeFilter: ['aria-expanded'] })
const dockOpen = computed(() => !verticalDock.value || cursorNearDock.value || cursorNearDockLately.value || dockFocused.value || dockMenuOpen.value)
// The tooltips of the dock open into the window: below a dock that lies along the top, and beside a dock that stands
// up at the side of the character.
const dockTooltipSide = computed<TooltipContentProps['side']>(() => {
  if (!verticalDock.value)
    return 'bottom'
  return characterOnLeft.value ? 'right' : 'left'
})
// The name button opens the conversations. A dock that stands up has no room for the name, so its tooltip gives the
// name too.
const conversationsLabel = computed(() => {
  const label = t('tamagotchi.stage.chat-window.conversations')
  return verticalDock.value ? `${activeCard.value?.name || 'AIRI'} · ${label}` : label
})

const dockInstance = useTemplateRef<InstanceType<typeof Dock>>('dock')
const dockElement = computed<HTMLElement | undefined>(() => dockInstance.value?.$el)

/** The padding of the zone along a dock that stands up, in pixels. It matches the `py-4` of the zone. */
const DOCK_ZONE_PADDING = 16
// A dock that stands up centers on the dock alone. The island below it only makes the zone longer, so the dock does
// not move when the island buds off or goes back.
const { height: dockHeight } = useElementSize(dockElement, undefined, { box: 'border-box' })
const verticalDockZoneStyle = computed(() => ({ transform: `translateY(${-(DOCK_ZONE_PADDING + dockHeight.value / 2)}px)` }))
/**
 * The bar of a closed dock: 8px wide and 56px tall, at the middle of the dock, on its side of the window edge.
 * The dock stands 10px from the edge, just past the hover scrollbar, so the bar sits between the scrollbar and the messages.
 */
const DOCK_BAR = { width: 8, height: 56, edgeInset: 0 }
/**
 * The clip of an open dock. It reaches 4px past the dock, so the focus ring of a button is not cut. The ring is 2px
 * wide and 2px from the button, and the button is 2px inside the dock.
 */
const DOCK_OPEN_CLIP = 'inset(-4px -4px -4px -4px round 999px)'

/** Where the bar of a closed dock sits in the dock, in pixels from its top left corner. */
function dockBarBox(dock: HTMLElement) {
  const top = (dock.offsetHeight - DOCK_BAR.height) / 2
  const left = characterOnLeft.value ? DOCK_BAR.edgeInset : dock.offsetWidth - DOCK_BAR.edgeInset - DOCK_BAR.width
  return { top, left, width: DOCK_BAR.width, height: DOCK_BAR.height }
}

/** The clip that leaves only the bar of the dock. */
function dockBarClip(dock: HTMLElement) {
  const bar = dockBarBox(dock)
  const right = dock.offsetWidth - bar.left - bar.width
  const bottom = dock.offsetHeight - bar.top - bar.height
  return `inset(${bar.top}px ${right}px ${bottom}px ${bar.left}px round 999px)`
}

// A closed dock opens only on its bar. The zone around the bar reaches over the edge of the messages, for example over
// the actions button of a message, and an open dock slides the messages aside. An open dock stays open in the whole
// zone, so the cursor can move from the bar onto the items and the island, and come back from one of its menus.
const { elementX: cursorInDockX, elementY: cursorInDockY } = useElectronMouseInElement(dockElement)
const cursorOnDockBar = computed(() => {
  const dock = dockElement.value
  if (!dock)
    return false
  const bar = dockBarBox(dock)
  return cursorInDockX.value >= bar.left && cursorInDockX.value <= bar.left + bar.width
    && cursorInDockY.value >= bar.top && cursorInDockY.value <= bar.top + bar.height
})
watch([cursorOnDockBar, cursorAwayFromDock], ([onBar, away]) => {
  if (away)
    cursorNearDock.value = false
  else if (onBar || dockOpen.value)
    cursorNearDock.value = true
})

/** The items of the dock in their order along it: the buttons, the separator, and the buttons of the group. */
function dockItems(dock: HTMLElement) {
  return [...dock.children].flatMap(child => child.tagName === 'DIV' && child.childElementCount > 0 ? [...child.children] : [child]) as HTMLElement[]
}

let dockAnimations: Array<ReturnType<typeof animate>> = []

/**
 * Turns the dock into its bar and back. The bar is the dock itself under a clip, so opening grows the same white shape
 * out of the bar, and the items fade in together once the shape is nearly open. They do not move, so the column stays
 * straight. Closing fades the items first and then draws the shape back into the bar.
 *
 * The window lets clicks through where nothing is painted, and it checks that again only when the cursor moves. The
 * dock changes what is painted under a still cursor, so each change checks again once it is done. Closing removes the
 * dock from under the cursor, so the window lets clicks through there at once.
 *
 * The bar sits on the side of the dock toward the character, so a switch of the attached side moves it too.
 *
 * The content hides while the chat folds or moves, and a hidden dock has no size, so its bar has no place. The dock
 * takes its state once it shows and has its size again.
 */
watch([verticalDock, dockOpen, characterOnLeft, dockHeight], async ([vertical, open, onLeft, height], previous) => {
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
  if (!height)
    return
  const target = open ? DOCK_OPEN_CLIP : dockBarClip(dock)
  // A dock that only now stands up or shows, a dock that changes sides or size, or a reduced motion takes the state at
  // once.
  if (!previous?.[0] || previous[2] !== onLeft || previous[3] !== height || reducedMotion.value === 'reduce') {
    dock.style.clipPath = target
    items.forEach(item => item.style.opacity = open ? '' : '0')
    hitTest({ removed: !open })
    return
  }
  const from = dock.style.clipPath || DOCK_OPEN_CLIP
  if (open) {
    // The buttons take clicks once they show, before the spring of the shape settles.
    dockAnimations.push(animate(dock, { clipPath: [from, target], ease: ISLAND_SPRING, onComplete: () => hitTest() }))
    dockAnimations.push(animate(items, { opacity: [0, 1], duration: 160, delay: 120, ease: 'outQuad', onComplete: () => hitTest() }))
  }
  else {
    dockAnimations.push(animate(items, { opacity: 0, duration: 100, ease: 'inQuad' }))
    dockAnimations.push(animate(dock, { clipPath: [from, target], duration: 300, delay: 60, ease: 'inOutQuad', onComplete: () => hitTest({ removed: true }) }))
  }
}, { immediate: true })

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

/** The width of the resize band along an edge, in pixels. It matches the `w-[5px]` and `h-[5px]` of the bands below. */
const RESIZE_BAND = 5
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
        ref="panel"
        :class="[
          'absolute inset-0 flex flex-col gap-1 rounded-3xl pt-3',
          danmaku ? '' : 'bg-white/80 dark:bg-neutral-900/80',
        ]"
      >
        <!--
          The dock sits on the side away from the character. A character on the left mirrors the row and the dock, so
          the fold button stays at the outer end. A dock that stands up sits at the middle of the side of the character,
          with the island of the feed below it. Closed, it shrinks into a narrow bar. The dock stands 10px from the window
          edge, past the 10px hover scrollbar there, so it never covers the scrollbar. Closed, only its bar opens it. Its
          16px padding on the other sides is the zone that keeps an open dock open, and the scrollbar is outside it. The
          zone takes no pointer, so the history under it still takes hover, wheel, and clicks. A dock that stands up stays
          over the composer layer of `ChatViewportLayout` (z-index 20), so a tall composer or setup callout cannot cover it.
        -->
        <div
          ref="dock-zone"
          :class="verticalDock
            ? ['pointer-events-none absolute top-1/2 z-30 w-12 flex flex-col items-center gap-2 py-4', characterOnLeft ? 'left-2.5 pr-4' : 'right-2.5 pl-4']
            : ['flex items-center gap-2 px-4', characterOnLeft ? 'flex-row-reverse' : '']"
          :style="verticalDock ? verticalDockZoneStyle : undefined"
        >
          <!--
            The dock stays over the island, so the island can hide under its edge. A dock that stands up draws its
            shadow on this wrapper, because the clip that turns it into its bar would cut a box shadow.
          -->
          <div :class="['relative z-1 min-w-0', verticalDock ? 'drop-shadow-md' : '']">
            <Dock
              ref="dock"
              variant="blurry"
              :orientation="verticalDock ? 'vertical' : 'horizontal'"
              :tooltip-side="dockTooltipSide"
              :shadow="!verticalDock"
              :class="['pointer-events-auto min-w-0', !verticalDock && characterOnLeft ? 'flex-row-reverse' : '']"
            >
              <DockButton icon="i-lucide:minimize-2" :label="t('tamagotchi.stage.chat-window.fold')" @click="foldChat()" />
              <Tooltip v-if="freePlacement" :label="t('tamagotchi.stage.chat-window.move')" :side="dockTooltipSide">
                <button
                  :aria-label="t('tamagotchi.stage.chat-window.move')"
                  :class="[
                    'h-7 w-5 shrink-0 cursor-grab touch-none rounded-full',
                    'flex items-center justify-center outline-none transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                    dockItemClasses('blurry'),
                  ]"
                  @pointerdown="holdPointer"
                  @pointermove="moveWithHeldPointer"
                  @lostpointercapture="releasePointer"
                  @keydown="handleArrowKey($event, moveByKeyboard)"
                >
                  <div class="i-ph:dots-six-vertical-bold size-4" />
                </button>
              </Tooltip>
              <!--
                A plain button: GhostButton wraps its slot in a span that cannot shrink, so a long name could not
                truncate.
              -->
              <Tooltip :label="conversationsLabel" :side="dockTooltipSide">
                <button
                  :aria-label="verticalDock ? activeCard?.name || 'AIRI' : undefined"
                  :class="[
                    'group min-w-0 flex items-center gap-1.5 rounded-full outline-none transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                    dockItemClasses('blurry'),
                    verticalDock ? 'p-0.5' : characterOnLeft ? 'flex-row-reverse py-0.5 pl-2 pr-0.5' : 'py-0.5 pl-0.5 pr-2',
                  ]"
                  @click="sessionsDrawerOpen = true"
                >
                  <!-- The icon and the name take the icon color of the dock. Hover shows the background of the button. -->
                  <span :class="['size-6 shrink-0', 'flex items-center justify-center text-base']">
                    <span class="i-mingcute:chat-2-line" />
                  </span>
                  <span v-if="!verticalDock" class="truncate text-sm font-medium">{{ activeCard?.name || 'AIRI' }}</span>
                </button>
              </Tooltip>
              <DockSeparator />
              <div :class="['flex shrink-0 items-center', verticalDock ? 'flex-col' : characterOnLeft ? 'flex-row-reverse' : '']">
                <ChatSpeechMuteButton variant="dock" />
                <DockButton
                  icon="i-mingcute:subtitle-line"
                  :label="t('tamagotchi.stage.chat-window.danmaku')"
                  :pressed="danmaku"
                  @click="toggleDanmaku"
                />
                <DockButton
                  icon="i-mingcute:pin-2-line"
                  pressed-icon="i-mingcute:pin-2-fill"
                  :label="t('tamagotchi.stage.chat-window.pin')"
                  :pressed="state.pinned"
                  @click="togglePinned"
                />
                <ChatWindowStyleMenu variant="dock" />
              </div>
            </Dock>
          </div>
          <!--
            The settings of the message feed are an island of their own while the feed is on. It buds off the dock on
            the side that leaves the dock in place, and goes back under the dock when the feed turns off. Under a dock
            that stands up, the island waits until the dock has grown out of its bar.
          -->
          <TransitionBud :from="verticalDock ? 'top' : characterOnLeft ? 'right' : 'left'" :delay="verticalDock ? 160 : 0">
            <Dock
              v-if="danmaku && dockOpen"
              variant="blurry"
              :tooltip-side="dockTooltipSide"
              :class="['pointer-events-auto relative z-0 shrink-0']"
            >
              <ChatDanmakuFeedMenu variant="dock" />
            </Dock>
          </TransitionBud>
        </div>

        <div :class="['relative min-h-0 flex-1']">
          <!--
            TODO: When Windows and Linux draw native glass behind a transparent window, the floating panel there can
            use the chat window surfaces too. Then `glassBackdrop` only needs to check the danmaku feed.
          -->
          <InteractiveArea
            ref="interactive-area"
            v-model:composer-folded="composerFolded"
            floating
            :glass-backdrop="glassBackdrop"
            :composer-foldable="danmaku"
            :dock-side="verticalDock && dockOpen ? (characterOnLeft ? 'left' : 'right') : undefined"
            :right-resize-band="state.resizeEdges.includes('e') ? RESIZE_BAND : undefined"
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
