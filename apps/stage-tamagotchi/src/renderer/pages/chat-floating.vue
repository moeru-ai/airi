<script setup lang="ts">
import type { ResizeDirection } from '@proj-airi/electron-eventa'
import type { TooltipContentProps } from 'reka-ui'

import type { ChatFloatingState, ChatWindowPreferences } from '../../shared/eventa'

import { getElectronEventaContext, useElectronEventaInvoke, useElectronMouseAroundWindowBorder, useElectronMouseInElement } from '@proj-airi/electron-vueuse'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { CharacterRail, ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useBackdropSurface } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useActiveChatName } from '@proj-airi/stage-ui/composables/use-active-chat-name'
import { useCharacterActivation } from '@proj-airi/stage-ui/composables/use-character-activation'
import { useCharacterPreviews } from '@proj-airi/stage-ui/composables/use-character-previews'
import { useDanmakuFeedExpiry } from '@proj-airi/stage-ui/composables/use-danmaku-feed-expiry'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Avatar, Dock, DockButton, dockItemClasses, DockSeparator, Tooltip, TransitionBud } from '@proj-airi/ui'
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
  electronOpenSettings,
} from '../../shared/eventa'
import { useChatDraftHandover } from '../composables/use-chat-draft-handover'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'
import { useControlsIslandStore } from '../stores/controls-island'

const panel = useTemplateRef<HTMLElement>('panel')
const windowIsland = useTemplateRef<HTMLElement>('window-island')

const { t } = useI18n()
/**
 * The panel has two levels: the conversations of the character on the stage, and the open conversation. The list
 * pushes in from the start. A conversation that the list opens pushes back in from the end.
 */
const listOpen = shallowRef(false)
const { activeCardId, cards } = storeToRefs(useAiriCardStore())
const characterPreviews = useCharacterPreviews()
const activeCharacterName = computed(() => cards.value.get(activeCardId.value)?.name ?? t('stage.character-switcher.empty'))
/** The name of the open chat, as its row shows it. A chat without a name shows the fallback in a lighter color. */
const activeChatName = useActiveChatName()
const activeSessionTitle = computed(() => activeChatName.value ?? t('stage.chat.sessions.new-chat-fallback'))
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')

// Folded until the main process answers, so the first unfold plays the same
// animation as every later one.
const state = shallowRef<ChatFloatingState>({ placement: 'attached', danmaku: false, side: 'left', resizeEdges: [], folded: true, relocating: false, pinned: false })
const getState = useElectronEventaInvoke(electronChatFloatingGetState)
const reportContentHidden = useElectronEventaInvoke(electronChatFloatingContentHidden)
const resizeBy = useElectronEventaInvoke(electronChatFloatingResizeBy)
const moveTo = useElectronEventaInvoke(electronChatFloatingMoveTo)
const foldChat = useElectronEventaInvoke(electronChatFloatingFold)
const openSettings = useElectronEventaInvoke(electronOpenSettings)
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
// desktop, so a feed that fades out leaves nothing behind. Its list of
// conversations shows on the panel, with the window buttons and the
// characters beside it.
const panelShown = computed(() => !danmaku.value || listOpen.value)
useBackdropSurface(panel, { enabled: panelShown })
useBackdropSurface(windowIsland, { enabled: panelShown })
// The window draws native glass only on macOS. See `services/electron/window-backdrop.ts`.
const nativeGlass = isElectronWindow(window) && window.platform === 'darwin'
const glassBackdrop = computed(() => nativeGlass && !danmaku.value)
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
// toward it. The dock, the window buttons, and the characters sit on the
// other side.
const characterOnLeft = computed(() => state.value.side === 'right')
/** The tooltips of the column of the window buttons and the characters open toward the panel. */
const columnTooltipSide = computed(() => characterOnLeft.value ? 'left' : 'right')

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
// The conversation button shows the character and the current conversation, and opens the list of the conversations.
// A dock that stands up has room for the avatar only, so its title gives both names.
const conversationsLabel = computed(() => `${activeCharacterName.value} · ${activeSessionTitle.value} · ${t('tamagotchi.stage.chat-window.conversations')}`)

/** Opens a page of the character settings. */
function openCharacterPage(route: string) {
  void openSettings({ route })
}

/** The buttons of the island of the window: 52px squares 2px inside it, 2px less round than the island. */
const windowButtonClasses = [
  'size-13 shrink-0 flex items-center justify-center rounded-[18px] outline-none transition-colors',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
]

const { activateCharacter } = useCharacterActivation()
/**
 * Puts a character of the rail on the stage, with or without a chat, so the user can talk to it by voice at once. The
 * list then shows its conversations, so the user can pick one.
 */
async function selectCharacter(characterId: string) {
  listOpen.value = true
  await activateCharacter(characterId)
}

// The panel and the column beside the message feed change what is painted under a still cursor.
watch(panelShown, async () => {
  await nextTick()
  hitTest()
})

const dockInstance = useTemplateRef<InstanceType<typeof Dock>>('dock')
const dockElement = computed<HTMLElement | undefined>(() => dockInstance.value?.$el)
const feedDockInstance = useTemplateRef<InstanceType<typeof Dock>>('feed-dock')
// The danmaku feed has no panel glass, so its docks float over the desktop with glass of their own.
useBackdropSurface(dockElement, { enabled: danmaku })
useBackdropSurface(computed(() => feedDockInstance.value?.$el as HTMLElement | undefined), { enabled: danmaku })

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
// The history keeps its scrollbar clear of the band along the right edge, where the panel reaches that edge.
const rightResizeBand = computed(() => state.value.resizeEdges.includes('e') && (!panelShown.value || !characterOnLeft.value) ? RESIZE_BAND : undefined)
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
      <!--
        The column of the window buttons and the characters stands on the side away from the character, beside the panel.
        A character on the left mirrors the row. The message feed has no panel and no column, until its list opens.
      -->
      <div
        v-show="contentShown"
        :class="['absolute inset-0 flex gap-2', characterOnLeft ? 'flex-row-reverse' : '']"
      >
        <!--
          The islands of the column are as wide as the rail of the characters. The window buttons are icons, so they fill
          their island as the buttons of a `Dock` do: 52px squares 2px inside it. The rail holds avatars, which are
          heavier, so it leaves them room. Both islands are rounded rectangles with 20px corners.
        -->
        <div v-if="panelShown" :class="['min-h-0 w-14 flex shrink-0 flex-col gap-2']">
          <div
            ref="window-island"
            :class="[
              'flex shrink-0 flex-col items-center rounded-[20px] p-0.5',
              // The surface of a blurry `Dock`. It meets the window edge, which would cut a shadow, so it has none, as the panel.
              'bg-neutral-50/80 backdrop-blur-[12px] dark:bg-neutral-800/70',
            ]"
          >
            <Tooltip :label="t('tamagotchi.stage.chat-window.fold')" :side="columnTooltipSide" variant="blurry">
              <button
                type="button"
                :aria-label="t('tamagotchi.stage.chat-window.fold')"
                :class="[windowButtonClasses, dockItemClasses('blurry')]"
                @click="foldChat()"
              >
                <div class="i-lucide:minimize-2 size-5" />
              </button>
            </Tooltip>
            <Tooltip :label="t('tamagotchi.stage.chat-window.pin')" :side="columnTooltipSide" variant="blurry">
              <button
                type="button"
                :aria-label="t('tamagotchi.stage.chat-window.pin')"
                :aria-pressed="state.pinned"
                :class="[windowButtonClasses, dockItemClasses('blurry', state.pinned)]"
                @click="togglePinned"
              >
                <div :class="[state.pinned ? 'i-mingcute:pin-2-fill' : 'i-mingcute:pin-2-line', 'size-5']" />
              </button>
            </Tooltip>
            <!--
              The grip of a free chat sits at the end of the island that faces into the window, as the grip of the
              Controls Island. Its dots are one step quieter than the icons.
            -->
            <Tooltip v-if="freePlacement" :label="t('tamagotchi.stage.chat-window.move')" :side="columnTooltipSide" variant="blurry">
              <button
                type="button"
                :aria-label="t('tamagotchi.stage.chat-window.move')"
                :class="[
                  'h-6 w-13 shrink-0 cursor-grab touch-none rounded-b-[18px] rounded-t-[6px]',
                  'flex items-center justify-center outline-none transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                  dockItemClasses('blurry'),
                ]"
                @pointerdown="holdPointer"
                @pointermove="moveWithHeldPointer"
                @lostpointercapture="releasePointer"
                @keydown="handleArrowKey($event, moveByKeyboard)"
              >
                <div class="i-mingcute:dots-vertical-fill size-4 text-neutral-400/70 dark:text-neutral-400" />
              </button>
            </Tooltip>
          </div>
          <!-- A pick puts the character on the stage at once, and the list shows its conversations. -->
          <CharacterRail
            variant="island"
            :tooltip-side="columnTooltipSide"
            :class="['min-h-0 flex-1']"
            @select="selectCharacter"
            @manage="openCharacterPage('/settings/airi-card')"
          />
        </div>

        <div
          ref="panel"
          :class="[
            'relative min-w-0 flex-1 overflow-hidden rounded-[28px]',
            // macOS draws native glass behind this fill. Other platforms have no glass, so the same 80% fill shows the desktop.
            panelShown ? nativeGlass ? 'bg-white/80 dark:bg-neutral-900/80' : 'bg-neutral-50 dark:bg-neutral-950' : '',
          ]"
        >
          <!--
            The list of the conversations. It steps back to the start under the conversation, and slides in again when it
            opens. Escape that the list does not use goes back to the conversation.
          -->
          <div
            :inert="!listOpen"
            :class="[
              'absolute inset-0 transition-[transform,opacity] duration-340 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
              listOpen ? '' : '-translate-x-1/4 opacity-0',
            ]"
            @keydown.esc="listOpen = false"
            @transitionend.self="hitTest()"
          >
            <ChatSessionsDrawer
              v-model="listOpen"
              desktop-mode="inline"
              desktop
              islands
              @open-character-settings="characterId => openCharacterPage(`/settings/airi-card/${encodeURIComponent(characterId)}`)"
            />
          </div>

          <div
            :inert="listOpen"
            :class="[
              'absolute inset-0 flex flex-col transition-transform duration-340 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
              danmaku ? 'gap-1 pt-3' : '',
              listOpen ? 'translate-x-full' : '',
            ]"
            @transitionend.self="hitTest()"
          >
            <!--
              The conversation opens under two islands, 8px inside the panel: the conversation, which goes back to the
              list, and the buttons of the chat. The conversation island is as wide as its names.
            -->
            <div v-if="!danmaku" :class="['flex shrink-0 items-center gap-1.5 p-2 pb-1']">
              <Dock variant="blurry" size="md" :class="['mr-auto min-w-0']">
                <button
                  type="button"
                  :aria-label="conversationsLabel"
                  :title="conversationsLabel"
                  :class="[
                    'h-9 min-w-0 flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-3.5 text-left outline-none transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                    dockItemClasses('blurry'),
                  ]"
                  @click="listOpen = true"
                >
                  <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
                  <Avatar
                    :src="characterPreviews.get(activeCardId)"
                    :class="[
                      'block size-8 shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
                      '[&_[data-avatar-image]]:object-top',
                    ]"
                  >
                    <template #fallback>
                      <span :class="['text-sm font-semibold']">{{ activeCharacterName.slice(0, 1) }}</span>
                    </template>
                  </Avatar>
                  <span :class="['min-w-0 flex flex-col leading-tight']">
                    <span :class="['truncate text-sm font-semibold']">{{ activeCharacterName }}</span>
                    <span :class="['truncate text-xs', activeChatName ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500']">
                      {{ activeSessionTitle }}
                    </span>
                  </span>
                </button>
              </Dock>
              <Dock variant="blurry" size="md" :class="['shrink-0']">
                <ChatSpeechMuteButton variant="dock" />
                <DockButton
                  icon="i-mingcute:subtitle-line"
                  :label="t('tamagotchi.stage.chat-window.danmaku')"
                  :pressed="danmaku"
                  @click="toggleDanmaku"
                />
                <ChatWindowStyleMenu variant="dock" />
              </Dock>
            </div>
            <!--
              The message feed keeps its dock. The dock sits on the side away from the character. A character on the left
              mirrors the row and the dock, so the fold button stays at the outer end. A dock that stands up sits at the
              middle of the side of the character, with the island of the feed below it. Closed, it shrinks into a narrow
              bar. The dock stands 10px from the window edge, past the 10px hover scrollbar there, so it never covers the
              scrollbar. Closed, only its bar opens it. Its 16px padding on the other sides is the zone that keeps an open
              dock open, and the scrollbar is outside it. The zone takes no pointer, so the history under it still takes
              hover, wheel, and clicks. A dock that stands up stays over the composer layer of `ChatViewportLayout`
              (z-index 20), so a tall composer or setup callout cannot cover it.
            -->
            <div
              v-else
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
                    The conversation button opens the list of the conversations on the panel, with the window buttons and
                    the characters beside it. A plain button: GhostButton wraps its slot in a span that cannot shrink, so
                    a long title could not truncate. The title is the only part of the dock that shrinks. A dock that
                    stands up shows the avatar only, and the title of the button gives both names.
                  -->
                  <button
                    type="button"
                    :aria-label="conversationsLabel"
                    :title="conversationsLabel"
                    :class="[
                      'min-w-0 flex items-center gap-1.5 rounded-full outline-none transition-colors',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
                      dockItemClasses('blurry'),
                      verticalDock ? 'p-0.5' : characterOnLeft ? 'flex-row-reverse py-0.5 pl-2 pr-0.5' : 'py-0.5 pl-0.5 pr-2',
                    ]"
                    @click="listOpen = true"
                  >
                    <!-- Display model previews are portrait. Align them to the top so the circle keeps the head. -->
                    <Avatar
                      :src="characterPreviews.get(activeCardId)"
                      :class="[
                        'block size-6 shrink-0 rounded-full bg-neutral-200/70 text-neutral-600 dark:bg-neutral-700/70 dark:text-neutral-300',
                        '[&_[data-avatar-image]]:object-top',
                      ]"
                    >
                      <template #fallback>
                        <span :class="['text-xs font-semibold']">{{ activeCharacterName.slice(0, 1) }}</span>
                      </template>
                    </Avatar>
                    <span
                      v-if="!verticalDock"
                      :class="['truncate text-sm font-medium', activeChatName ? '' : 'text-neutral-400 dark:text-neutral-500']"
                    >
                      {{ activeSessionTitle }}
                    </span>
                  </button>
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
                The settings of the message feed are an island of their own while the feed is on. It buds off the dock
                on the side that leaves the dock in place, and goes back under the dock when the feed turns off. Under a
                dock that stands up, the island waits until the dock has grown out of its bar.
              -->
              <TransitionBud :from="verticalDock ? 'top' : characterOnLeft ? 'right' : 'left'" :delay="verticalDock ? 160 : 0">
                <Dock
                  v-if="dockOpen"
                  ref="feed-dock"
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
                :right-resize-band="rightResizeBand"
                :passive="passiveFeed"
                :expired-before="expiredBefore"
              />
            </div>
          </div>
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
        <!--
          The border frames the whole window, the column included. Its corners are as round as the islands of the column,
          the tighter corners at the window edge, so no corner of an island reaches past it.
        -->
        <WindowResizeBorder :shown="nearResizeEdge || nearResizeEdgeFor250Ms" :class="[panelShown ? 'rounded-[20px]' : 'rounded-[28px]']" />
      </div>
    </Transition>
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
  clip-path: inset(100% 0 0 100% round 28px);
  transform: scale(0.94);
  opacity: 0;
}

.chat-floating-fold-left-enter-from,
.chat-floating-fold-left-leave-to {
  clip-path: inset(100% 100% 0 0 round 28px);
  transform: scale(0.94);
  opacity: 0;
}

.chat-floating-fold-right-enter-to,
.chat-floating-fold-right-leave-from,
.chat-floating-fold-left-enter-to,
.chat-floating-fold-left-leave-from {
  clip-path: inset(0 0 0 0 round 28px);
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
