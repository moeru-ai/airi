<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'
import type { CSSProperties } from 'vue'

import type { RegisteredItem, RegisteredList, SwipeActionsSelectEvent, SwipeActionsSide } from './context'

import { onClickOutside, useEventListener, usePointerSwipe, usePreferredReducedMotion, useRafFn, useTimeoutFn } from '@vueuse/core'
import { eases } from 'animejs'
import { Primitive, useDirection, useForwardExpose } from 'reka-ui'
import { computed, shallowReactive, shallowRef, toRef, watch } from 'vue'

import { provideSwipeActionsContext } from './context'

const props = withDefaults(defineProps<PrimitiveProps & {
  /** Allows the default action to run after a long swipe. @default true */
  fullSwipe?: boolean
  /** Resolves logical start/end edges. @default Reka direction provider, or 'ltr'. */
  dir?: 'ltr' | 'rtl'
  /** Disables action gestures and selection, not the content's own controls. @default false */
  disabled?: boolean
}>(), { as: 'div', fullSwipe: true, disabled: false })

const emit = defineEmits<{
  /** Lets a list close another row when horizontal input takes ownership. */
  interactionStart: []
  /** Stable Item value, emitted once after an uncanceled press or committed swipe. */
  action: [value: string, side: SwipeActionsSide]
}>()
defineSlots<{
  default: (props: { open: boolean, side: SwipeActionsSide, armed: boolean, committing: boolean, close: () => void, toggle: (side?: SwipeActionsSide) => void }) => unknown
}>()
/** The parent can control this state to keep only one row open. @default false */
const open = defineModel<boolean>('open', { default: false })
/** Edge revealed by gestures or toggle. It remains selected when closed. @default 'end' */
const sideModel = defineModel<SwipeActionsSide>('side', { default: 'end' })
// A controlled prop updates on the parent's render; pointer geometry needs the
// selected edge in the same event, before that render reaches this component.
const side = shallowRef(sideModel.value)
const direction = useDirection(toRef(props, 'dir'))
const lists = shallowReactive(new Set<RegisteredList>())
const activeList = computed(() => [...lists].find(list => list.side.value === side.value))
const sign = computed(() => (side.value === 'end') === (direction.value === 'ltr') ? 1 : -1)
const { forwardRef, currentElement: root } = useForwardExpose()
const reducedMotion = usePreferredReducedMotion()
const actionWidth = computed(() => activeList.value?.actionWidth.value ?? 88)
const actionGap = computed(() => activeList.value?.gap.value ?? 8)
const items = shallowReactive(new Set<RegisteredItem>())
const orderVersion = shallowRef(0)
const allOrderedItems = computed(() => {
  void orderVersion.value
  return [...items].sort((a, b) => {
    if (a.element.value === b.element.value)
      return 0
    return a.element.value.compareDocumentPosition(b.element.value) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
})
const orderedItems = computed(() => allOrderedItems.value.filter(item => item.list === activeList.value))
const primary = computed(() => {
  const defaultAction = activeList.value?.defaultAction.value
  const item = defaultAction === undefined
    ? orderedItems.value.at(-1)
    : orderedItems.value.find(item => item.value.value === defaultAction)
  // An explicit missing/disabled default never falls through to another action.
  return item && !item.disabled.value && !props.disabled ? item : undefined
})
const actionCount = computed(() => orderedItems.value.length)
const settledWidth = computed(() => actionWidth.value * actionCount.value)
const reveal = shallowRef(open.value ? settledWidth.value : 0)
const offset = computed(() => reveal.value * sign.value)
const takeover = shallowRef(0)
let takeoverVelocity = 0
const armed = shallowRef(false)
const committing = shallowRef(false)
const rowWidth = shallowRef(0)
const dragTarget = shallowRef<number | null>(null)
const target = computed(() => {
  if (committing.value || armed.value)
    return rowWidth.value
  return dragTarget.value ?? (open.value ? settledWidth.value : 0)
})

// This row owns transient input and animation, never the conversation store.
// Pointer input pauses the spring at its visible position. Horizontal intent
// takes ownership; vertical intent stays native until release. Wheel sequences
// end after an idle interval because browsers expose no trackpad finger-up event.
// An opted-in full swipe arms from actual travel, never projected velocity.
// Arming hands the visible surface to the spring while raw input keeps tracking.
// Reversal hands it back without jumping. Release locks this full-width phase;
// only its completion emits the action, so list collapse cannot race the slide.
// The completed surface stays visible briefly while its owner removes the row.
// A retained row resets afterward, so an unsuccessful action cannot lock it.
let intent: 'pending' | 'horizontal' | 'vertical' = 'pending'
let pointerActive = false
let wheelActive = false
let wheelMovementX = 0
let wheelMovementY = 0
let startOffset = 0
let changingSide = false
let rawTravel = 0
let stretchLimit = actionWidth.value
let velocity = 0
let inputVelocity = 0
let commitDispatched = false
let pendingItem: RegisteredItem | undefined
let lastMoveAt = 0
let suppressClick = false
let actionFocusOrigin: Element | undefined

const spring = useRafFn(advanceSpring, { immediate: false })
const wheelEnd = useTimeoutFn(endWheel, 180, { immediate: false })
// Keep the completed surface through the caller's row-leave animation. This is
// a recovery window for a retained row, not a delay before invoking the action.
const commitReset = useTimeoutFn(resetCommittedRow, 500, { immediate: false })
const { distanceX, distanceY } = usePointerSwipe(root, {
  threshold: 0,
  disableTextSelect: true,
  onSwipeStart: beginSwipe,
  onSwipe: moveSwipe,
})
// usePointerSwipe only calls onSwipeEnd after movement. A stationary tap must
// also release a spring paused by pointerdown. VueUse disposes all listeners,
// the frame loop, and the idle timer when this row unmounts.
useEventListener(root, ['pointerup', 'pointercancel'], endSwipe)
useEventListener(root, 'wheel', moveWheel, { passive: false })
onClickOutside(root, close)
watch([open, settledWidth, reducedMotion], () => {
  if (!changingSide)
    settle()
}, { flush: 'sync' })
watch(sideModel, (value) => {
  if (value !== side.value) {
    side.value = value
    restoreContentFocus(false)
    reveal.value = 0
    cancelGesture()
  }
}, { flush: 'sync' })
watch(direction, () => {
  if (changingSide)
    return
  restoreContentFocus(false)
  reveal.value = 0
  cancelGesture()
}, { flush: 'sync' })
// Restore focus before List applies inert, including parent-controlled closes.
watch(open, restoreContentFocus, { flush: 'sync' })
watch([open, reveal], focusRevealedAction, { flush: 'post' })

/**
 * Triggering workflow: useRafFn -> animation frame -> advanceSpring -> reveal.
 * An analytic critically damped spring keeps position and velocity continuous
 * across frame rates and when a new gesture interrupts a previous release.
 */
function advanceSpring({ delta }: { delta: number }) {
  // Velocity uses pixels/second. Cap elapsed time after a background-tab pause.
  const seconds = Math.min(delta, 64) / 1000
  const displacement = reveal.value - target.value
  const decay = Math.exp(-24 * seconds)
  const impulse = velocity + 24 * displacement
  reveal.value = Math.max(0, target.value + (displacement + impulse * seconds) * decay)
  velocity = (velocity - 24 * impulse * seconds) * decay
  const takeoverTarget = armed.value || committing.value ? 1 : 0
  const takeoverDisplacement = takeover.value - takeoverTarget
  const takeoverImpulse = takeoverVelocity + 24 * takeoverDisplacement
  takeover.value = Math.max(0, Math.min(1, takeoverTarget + (takeoverDisplacement + takeoverImpulse * seconds) * decay))
  takeoverVelocity = (takeoverVelocity - 24 * takeoverImpulse * seconds) * decay
  if (Math.abs(reveal.value - target.value) < 0.15 && Math.abs(velocity) < 3
    && Math.abs(takeover.value - takeoverTarget) < 0.001 && Math.abs(takeoverVelocity) < 0.01) {
    finishMotion()
  }
}

function finishMotion() {
  spring.pause()
  velocity = 0
  reveal.value = target.value
  takeover.value = armed.value || committing.value ? 1 : 0
  takeoverVelocity = 0
  if (committing.value && !commitDispatched) {
    commitDispatched = true
    commitReset.start()
    if (pendingItem)
      dispatchAction(pendingItem, 'swipe')
  }
}

/** Triggering workflow: commitReset -> resetCommittedRow -> restore a retained row after its action. */
function resetCommittedRow() {
  committing.value = false
  commitDispatched = false
  pendingItem = undefined
  settle()
}

/** Triggering workflow: model/reduced-motion watch or gesture release -> settle -> frame loop. */
function settle() {
  pointerActive = false
  wheelActive = false
  armed.value = false
  dragTarget.value = null
  wheelEnd.stop()
  // A held takeover can already be at rest when released. Complete it now
  // instead of waiting for a redundant frame before dispatching the action.
  if (reducedMotion.value === 'reduce' || (Math.abs(reveal.value - target.value) < 0.15 && Math.abs(velocity) < 3 && Math.abs(takeover.value - (committing.value ? 1 : 0)) < 0.001)) {
    finishMotion()
    return
  }
  spring.resume()
}

/** Triggering workflow: keyboard toggle -> first visible frame -> focus the revealed action. */
function focusRevealedAction() {
  if (!actionFocusOrigin || !open.value || reveal.value === 0)
    return
  const origin = actionFocusOrigin
  actionFocusOrigin = undefined
  // A Tab press or outside click during opening keeps its new focus owner.
  if (root.value?.ownerDocument.activeElement !== origin)
    return
  orderedItems.value.find(item => !item.disabled.value)?.element.value.focus({ preventScroll: true })
}

/** Triggering workflow: open model closes -> move focus out of the hidden List. */
function restoreContentFocus(isOpen: boolean) {
  if (isOpen || !root.value)
    return
  actionFocusOrigin = undefined
  const active = root.value.ownerDocument.activeElement
  if (!active?.closest('[data-swipe-actions-list]') || active.closest('[data-swipe-actions]') !== root.value)
    return
  root.value.querySelector<HTMLElement>('[data-swipe-actions-content]')?.focus({ preventScroll: true })
}

function close() {
  if (committing.value)
    return
  open.value = false
  velocity = 0
  settle()
}

function toggle(requestedSide: SwipeActionsSide = side.value) {
  if (committing.value || props.disabled || !hasSide(requestedSide))
    return
  const switched = requestedSide !== side.value
  if (!open.value || switched)
    emit('interactionStart')
  if (switched)
    selectSide(requestedSide)
  const opening = switched || !open.value
  const active = root.value?.ownerDocument.activeElement
  actionFocusOrigin = opening && active && root.value?.contains(active) && active.matches(':focus-visible') ? active : undefined
  open.value = opening
  velocity = 0
  settle()
}

function hasSide(value: SwipeActionsSide) {
  return [...items].some(item => item.list.side.value === value && lists.has(item.list))
}

// Side changes at zero preserve the active gesture. External model changes
// instead cancel it, so an in-flight full swipe cannot select the other List.
function selectSide(value: SwipeActionsSide) {
  restoreContentFocus(false)
  changingSide = true
  side.value = value
  sideModel.value = value
  changingSide = false
  spring.pause()
  armed.value = false
  takeover.value = 0
  takeoverVelocity = 0
  velocity = 0
  inputVelocity = 0
  reveal.value = 0
  dragTarget.value = 0
  stretchLimit = Math.max(1, rowWidth.value - settledWidth.value - 12)
}

function followOffset(value: number) {
  const requestedSide = (value >= 0) === (direction.value === 'ltr') ? 'end' : 'start'
  if (requestedSide !== side.value && hasSide(requestedSide))
    selectSide(requestedSide)
  followTravel(Math.max(0, value * sign.value))
}

function captureTravel() {
  spring.pause()
  wheelEnd.stop()
  rowWidth.value = root.value?.clientWidth ?? actionWidth.value * 2
  stretchLimit = Math.max(1, rowWidth.value - settledWidth.value - 12)
  armed.value = false
  // Invert the resistance curve so grabbing a stretched row does not jump.
  const excess = Math.max(0, reveal.value - settledWidth.value)
  rawTravel = reveal.value <= settledWidth.value
    ? reveal.value
    : settledWidth.value + excess * stretchLimit / Math.max(1, stretchLimit - excess)
  startOffset = rawTravel * sign.value
  velocity = 0
  inputVelocity = 0
  lastMoveAt = performance.now()
}

function followTravel(travel: number) {
  rawTravel = Math.max(0, travel)
  // The 10% return band prevents a noisy finger or trackpad from flickering the
  // cue at the threshold. Pulling back below it cancels the pending action.
  const wasArmed = armed.value
  const commitThreshold = Math.max(actionCount.value > 1 ? settledWidth.value + (armed.value ? 8 : 32) : actionWidth.value * 1.6, rowWidth.value * (armed.value ? 0.55 : 0.65))
  armed.value = props.fullSwipe && !!primary.value && rawTravel >= commitThreshold
  const excess = Math.max(0, rawTravel - settledWidth.value)
  // Unit slope at the settled width, then increasing resistance near the edge.
  // The same reveal value drives both row translation and action width.
  const next = Math.min(rawTravel, settledWidth.value) + stretchLimit * excess / (stretchLimit + excess)
  const now = performance.now()
  const elapsed = Math.max(1, now - lastMoveAt)
  inputVelocity = Math.max(-1800, Math.min(1800, (next - (dragTarget.value ?? reveal.value)) / elapsed * 1000))
  lastMoveAt = now
  dragTarget.value = next
  if (reducedMotion.value === 'reduce') {
    reveal.value = target.value
    takeover.value = armed.value ? 1 : 0
    return
  }
  if (armed.value || wasArmed || spring.isActive.value) {
    spring.resume()
    return
  }
  velocity = inputVelocity
  reveal.value = next
}

/** Triggering workflow: usePointerSwipe -> pointerdown -> beginSwipe -> pause spring. */
function beginSwipe() {
  if (committing.value || props.disabled || !items.size)
    return
  intent = 'pending'
  pointerActive = true
  wheelActive = false
  suppressClick = false
  captureTravel()
}

/**
 * Triggering workflow: usePointerSwipe -> pointermove -> moveSwipe -> reveal.
 * Small horizontal movements follow immediately; diagonal input stays pending
 * until its direction is clear. Click suppression has its own movement threshold.
 */
function moveSwipe() {
  if (!pointerActive)
    return
  const horizontal = Math.abs(distanceX.value)
  const vertical = Math.abs(distanceY.value)
  if (intent === 'pending') {
    if (vertical > horizontal * 1.25) {
      intent = 'vertical'
      return
    }
    if (horizontal <= vertical * 1.25)
      return
    intent = 'horizontal'
    emit('interactionStart')
  }
  if (intent !== 'horizontal')
    return
  suppressClick ||= horizontal > 4
  followOffset(startOffset + distanceX.value)
}

/**
 * Triggering workflow: root pointerup/pointercancel -> endSwipe -> open and spring.
 * Cancellation restores the current model. Release projects recent velocity
 * over 100ms to distinguish a quick flick from a slow partial reveal.
 */
function endSwipe(event: PointerEvent) {
  if (!pointerActive)
    return
  if (intent === 'horizontal' && event.type !== 'pointercancel') {
    release()
  }
  else {
    velocity = 0
    settle()
  }
  intent = 'pending'
}

/**
 * Triggering workflow: endSwipe or endWheel -> release -> full-width motion or update:open.
 * finishMotion emits the armed action after the slide. Ordinary release retains velocity-based snapping.
 */
function release() {
  if (props.fullSwipe && armed.value && primary.value) {
    pendingItem = primary.value
    committing.value = true
    open.value = false
    velocity = Math.max(0, velocity)
    settle()
    return
  }
  velocity = performance.now() - lastMoveAt > 80 ? 0 : inputVelocity
  open.value = reveal.value + velocity * 0.1 > settledWidth.value / 2
  settle()
}

/**
 * Triggering workflow: root wheel -> moveWheel -> reveal -> idle release.
 * Only horizontal sequences are consumed. Vertical scrolling and pinch zoom
 * remain native. Momentum events remain part of the same wheel sequence.
 */
function moveWheel(event: WheelEvent) {
  if (pointerActive || committing.value || props.disabled || !items.size || event.ctrlKey)
    return
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (root.value?.clientWidth ?? actionWidth.value) : 1
  let delta = event.deltaX * unit
  if (!wheelActive) {
    intent = 'pending'
    wheelMovementX = 0
    wheelMovementY = 0
    wheelActive = true
  }
  wheelEnd.start()
  if (intent === 'pending') {
    wheelMovementX += delta
    wheelMovementY += event.deltaY * unit
    const horizontal = Math.abs(wheelMovementX)
    const vertical = Math.abs(wheelMovementY)
    // Match Swipeable's 16px intent distance and 1.5:1 axis ratio. Small first
    // samples stay native; the accumulated distance is applied once locked.
    if (Math.max(horizontal, vertical) < 16)
      return
    if (vertical >= horizontal * 1.5) {
      intent = 'vertical'
      return
    }
    if (horizontal < vertical * 1.5)
      return
    intent = 'horizontal'
    captureTravel()
    wheelEnd.start()
    emit('interactionStart')
    delta = wheelMovementX
  }
  if (intent !== 'horizontal')
    return
  // Some browsers make only the first wheel event cancelable. Later momentum
  // events still update the surface after this sequence owns horizontal input.
  if (event.cancelable)
    event.preventDefault()
  followOffset(rawTravel * sign.value + delta)
}

/** Triggering workflow: wheel idle timer -> endWheel -> release or native-scroll completion. */
function endWheel() {
  if (!wheelActive)
    return
  wheelActive = false
  if (intent === 'horizontal')
    release()
  intent = 'pending'
}

/**
 * Triggering workflow: root click capture -> consumeSwipeClick -> cancel row activation.
 * Keyboard clicks remain available after a pointer gesture.
 */
function consumeSwipeClick(event: MouseEvent) {
  if (!suppressClick || event.detail === 0)
    return
  suppressClick = false
  event.preventDefault()
  event.stopPropagation()
}

/** Triggering workflow: content click capture -> closeContent -> close without selecting the row. */
function closeContent(event: MouseEvent) {
  if (!open.value)
    return
  close()
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Registration follows mounted DOM order, including keyed reorders. Each item
 * unregisters before unmount. Changing items/defaults cancels an in-flight swipe
 * rather than transferring a pending action to a different item.
 */
function registerList(list: RegisteredList) {
  if ([...lists].some(existing => existing.side.value === list.side.value))
    throw new Error('SwipeActionsRoot supports one List per side.')
  lists.add(list)
  return () => lists.delete(list)
}

function register(item: RegisteredItem) {
  if ([...items].some(existing => existing.list === item.list && existing.value.value === item.value.value))
    throw new Error('SwipeActionsItem values must be unique within a List.')
  items.add(item)
  return () => items.delete(item)
}

function refreshOrder() {
  orderVersion.value += 1
}

/** Triggering workflow: Item press or committed spring -> selection -> Root action. */
function dispatchAction(item: RegisteredItem, source: 'press' | 'swipe') {
  if (!items.has(item) || item.disabled.value || props.disabled)
    return false
  const value = item.value.value
  const selectedSide = item.list.side.value
  const event: SwipeActionsSelectEvent = new CustomEvent('swipe-actions.select', { cancelable: true, detail: { value, source, side: selectedSide } })
  item.select(event)
  if (event.defaultPrevented)
    return false
  emit('action', value, selectedSide)
  return true
}

function activate(item: RegisteredItem) {
  if (committing.value || item.list !== activeList.value)
    return
  if (dispatchAction(item, 'press'))
    close()
}

/** Layout changes invalidate the identity captured by a gesture, even before release. */
function cancelGesture() {
  actionFocusOrigin = undefined
  commitReset.stop()
  resetCommittedRow()
  intent = 'pending'
}

function itemTakeover(item: RegisteredItem) {
  return item === (pendingItem ?? primary.value) ? takeover.value : 0
}

/**
 * Items before the default move behind the content's left clip. Items after an
 * explicit default move past the right clip. The default fills the same strip.
 */
function actionStyle(item: RegisteredItem): CSSProperties {
  if (item.list !== activeList.value)
    return { display: 'none' }
  const index = orderedItems.value.indexOf(item)
  const selected = pendingItem ?? primary.value
  const selectedIndex = selected ? orderedItems.value.indexOf(selected) : -1
  const revealProgress = settledWidth.value ? Math.min(1, reveal.value / settledWidth.value) : 0
  const scale = eases.outCubic(revealProgress)
  const opacity = eases.outQuad(revealProgress)
  // Eased items grow faster than the revealed strip. Keep their spacing and
  // anchor the group at the trailing edge; excess stays behind the content clip.
  const cell = actionCount.value ? Math.max(actionWidth.value, reveal.value / actionCount.value) * scale : 0
  const groupOffset = reveal.value - cell * actionCount.value
  const gap = Math.min(actionGap.value, actionWidth.value / 2) * scale
  const progress = selectedIndex < 0 ? 0 : takeover.value
  const leftShift = selectedIndex * cell * progress
  const rightShift = (actionCount.value - selectedIndex - 1) * cell * progress
  const left = index > selectedIndex && selectedIndex >= 0 ? index * cell + rightShift : index * cell - leftShift
  const width = index === selectedIndex ? cell + leftShift + rightShift : cell
  // Below the resting reveal, retain the layout proportions and scale the whole
  // item around its cell center. Width-only shrinking flattens surfaces and text.
  const layoutWidth = scale > 0 ? Math.max(0, width - gap) / scale : actionWidth.value - actionGap.value
  return {
    position: 'absolute',
    top: '0',
    height: '100%',
    [sign.value === 1 ? 'left' : 'right']: `${groupOffset + left + width / 2 - layoutWidth / 2}px`,
    width: `${layoutWidth}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'center',
    opacity,
  }
}

watch([
  () => {
    void orderVersion.value
    return JSON.stringify([
      [...lists].map(list => [list.side.value, list.actionWidth.value, list.gap.value, list.defaultAction.value]),
      allOrderedItems.value.map(item => [item.list.side.value, item.value.value, item.disabled.value]),
    ])
  },
  () => props.disabled,
  () => props.fullSwipe,
], cancelGesture, { flush: 'sync' })

provideSwipeActionsContext({
  open,
  armed,
  committing,
  reveal,
  side,
  direction,
  offset,
  registerList,
  disabled: computed(() => props.disabled),
  register,
  refreshOrder,
  actionStyle,
  itemTakeover,
  activate,
  close,
  toggle,
  closeContent,
})

/** Triggering workflow: root keydown -> dismissActions -> close before the drawer receives Escape. */
function dismissActions(event: KeyboardEvent) {
  if (event.key !== 'Escape' || (!open.value && reveal.value === 0))
    return
  close()
  event.stopPropagation()
}
</script>

<template>
  <Primitive
    :ref="forwardRef" :as="as" :as-child="asChild"
    data-swipe-actions :data-side="side" :dir="direction"
    :data-state="open ? 'open' : 'closed'"
    :data-armed="armed" :data-committing="committing"
    :data-disabled="disabled ? '' : undefined"
    :inert="committing"
    :style="{ 'position': 'relative', 'isolation': 'isolate', 'overflow': 'hidden', 'overscrollBehaviorX': 'contain', '--swipe-progress': Math.min(1, reveal / 32) }"
    @click.capture="consumeSwipeClick"
    @keydown="dismissActions"
  >
    <slot :side="side" :open="open" :armed="armed" :committing="committing" :close="close" :toggle="toggle" />
  </Primitive>
</template>
