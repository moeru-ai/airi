import type { MaybeElementRef, MouseInElementOptions, UseMouseOptions } from '@vueuse/core'

import { defineInvoke } from '@moeru/eventa'
import { bounds, cursorScreenPoint, electron, startLoopGetBounds, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { defaultWindow, tryOnMounted, unrefElement, useEventListener, useMutationObserver, useResizeObserver } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'

import { initializeHostContext } from './owner'

const pointerX = shallowRef(0)
const pointerY = shallowRef(0)
const pointerInsideWindow = shallowRef(false)
const windowBoundsX = shallowRef(0)
const windowBoundsY = shallowRef(0)
const windowBoundsWidth = shallowRef(0)
const windowBoundsHeight = shallowRef(0)
const sourceType = shallowRef<'mouse'>('mouse')

let trackingStarted = false
let trackingStopped = false
let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollCount = 0
let reportedPollingError = false

function updateElectronPointerInsideWindow() {
  const x = pointerX.value - windowBoundsX.value
  const y = pointerY.value - windowBoundsY.value
  pointerInsideWindow.value = x >= 0
    && y >= 0
    && x <= windowBoundsWidth.value
    && y <= windowBoundsHeight.value
}

function startElectronTracking() {
  const context = initializeHostContext().context

  context.on(cursorScreenPoint, (event) => {
    if (!event.body)
      return

    pointerX.value = event.body.x
    pointerY.value = event.body.y
    updateElectronPointerInsideWindow()
  })

  context.on(bounds, (event) => {
    if (!event.body)
      return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
    updateElectronPointerInsideWindow()
  })

  defineInvoke(context, startLoopGetCursorScreenPoint)()
    .catch(error => console.error('[host-context] Failed to start Electron pointer tracking.', error))
  defineInvoke(context, startLoopGetBounds)()
    .catch(error => console.error('[host-context] Failed to start Electron window bounds tracking.', error))
}

async function pollKiriePointer() {
  if (trackingStopped)
    return

  const platform = initializeHostContext().platform!

  try {
    const shouldRefreshBounds = pollCount % 30 === 0
    const [pointer, windowBounds] = await Promise.all([
      platform.hostWindow.getPointerPosition(),
      shouldRefreshBounds ? platform.hostWindow.getBounds() : undefined,
    ])

    pointerX.value = pointer.x
    pointerY.value = pointer.y
    pointerInsideWindow.value = pointer.inside

    if (windowBounds) {
      windowBoundsX.value = windowBounds.x
      windowBoundsY.value = windowBounds.y
      windowBoundsWidth.value = windowBounds.width
      windowBoundsHeight.value = windowBounds.height
    }

    reportedPollingError = false
    pollCount += 1
  }
  catch (error) {
    if (!reportedPollingError) {
      console.error('[host-context] Failed to poll Kirie pointer state.', error)
      reportedPollingError = true
    }
  }

  pollTimer = setTimeout(pollKiriePointer, 16)
}

function startTracking() {
  if (trackingStarted)
    return

  trackingStarted = true
  trackingStopped = false
  const host = initializeHostContext()

  if (host.runtime === 'electron') {
    startElectronTracking()
    return
  }

  pollKiriePointer()
    .catch(error => console.error('[host-context] Kirie pointer tracking stopped.', error))
}

function stopTracking() {
  trackingStopped = true
  if (pollTimer)
    clearTimeout(pollTimer)
  pollTimer = undefined
}

if (import.meta.hot)
  import.meta.hot.dispose(stopTracking)

export function useHostWindowBounds() {
  startTracking()

  return {
    x: windowBoundsX,
    y: windowBoundsY,
    width: windowBoundsWidth,
    height: windowBoundsHeight,
  }
}

export function useHostRelativeMouse(_options?: UseMouseOptions) {
  startTracking()
  const host = initializeHostContext()
  const x = host.runtime === 'kirie'
    ? pointerX
    : computed(() => pointerX.value - windowBoundsX.value)
  const y = host.runtime === 'kirie'
    ? pointerY
    : computed(() => pointerY.value - windowBoundsY.value)

  return {
    x,
    y,
    sourceType,
  }
}

export function useHostMouseInElement(
  target?: MaybeElementRef,
  options: MouseInElementOptions = {},
) {
  const {
    windowResize = true,
    windowScroll = true,
    handleOutside = true,
    window = defaultWindow,
  } = options
  const type = options.type || 'page'
  const { x, y } = useHostRelativeMouse(options)
  const targetRef = shallowRef(target ?? window?.document.body)
  const elementX = shallowRef(0)
  const elementY = shallowRef(0)
  const elementPositionX = shallowRef(0)
  const elementPositionY = shallowRef(0)
  const elementHeight = shallowRef(0)
  const elementWidth = shallowRef(0)
  const isOutside = shallowRef(true)

  function update() {
    if (!window)
      return

    const element = unrefElement(targetRef)
    if (!element || !(element instanceof Element))
      return

    const { left, top, width, height } = element.getBoundingClientRect()
    elementPositionX.value = left + (type === 'page' ? window.pageXOffset : 0)
    elementPositionY.value = top + (type === 'page' ? window.pageYOffset : 0)
    elementHeight.value = height
    elementWidth.value = width

    const nextElementX = x.value - elementPositionX.value
    const nextElementY = y.value - elementPositionY.value
    isOutside.value = width === 0
      || height === 0
      || nextElementX < 0
      || nextElementY < 0
      || nextElementX > width
      || nextElementY > height

    if (handleOutside || !isOutside.value) {
      elementX.value = nextElementX
      elementY.value = nextElementY
    }
  }

  const stopFunctions: Array<() => void> = []
  function stop() {
    stopFunctions.forEach(stopFunction => stopFunction())
    stopFunctions.length = 0
  }

  tryOnMounted(update)

  if (window) {
    const { stop: stopResizeObserver } = useResizeObserver(targetRef, update)
    const { stop: stopMutationObserver } = useMutationObserver(targetRef, update, {
      attributeFilter: ['style', 'class'],
    })
    const stopWatch = watch([targetRef, x, y], update)

    stopFunctions.push(stopResizeObserver, stopMutationObserver, stopWatch)
    useEventListener(document, 'mouseleave', () => isOutside.value = true, { passive: true })

    if (windowScroll)
      stopFunctions.push(useEventListener('scroll', update, { capture: true, passive: true }))
    if (windowResize)
      stopFunctions.push(useEventListener('resize', update, { passive: true }))
  }

  return {
    x,
    y,
    sourceType,
    elementX,
    elementY,
    elementPositionX,
    elementPositionY,
    elementHeight,
    elementWidth,
    isOutside,
    stop,
  }
}

export function useHostMouseInWindow(options: MouseInElementOptions = {}) {
  const mouse = useHostRelativeMouse(options)
  const { width, height } = useHostWindowBounds()
  const isOutside = computed(() => !pointerInsideWindow.value
    || mouse.x.value < 0
    || mouse.y.value < 0
    || mouse.x.value > width.value
    || mouse.y.value > height.value)

  return {
    ...mouse,
    isOutside,
  }
}

export interface UseHostMouseAroundWindowBorderOptions {
  /** Pixel distance from the window edge to consider near. */
  threshold?: number
  /** Extra distance outside the window that still counts as near. */
  overshoot?: number
}

export function useHostMouseAroundWindowBorder(
  options: UseHostMouseAroundWindowBorderOptions = {},
) {
  const threshold = options.threshold ?? 8
  const overshoot = options.overshoot ?? threshold
  const { x, y } = useHostRelativeMouse()
  const { width, height } = useHostWindowBounds()
  const nearLeft = computed(() => Math.abs(x.value) <= threshold && y.value > -overshoot && y.value < height.value + overshoot)
  const nearRight = computed(() => Math.abs(x.value - width.value) <= threshold && y.value > -overshoot && y.value < height.value + overshoot)
  const nearTop = computed(() => Math.abs(y.value) <= threshold && x.value > -overshoot && x.value < width.value + overshoot)
  const nearBottom = computed(() => Math.abs(y.value - height.value) <= threshold && x.value > -overshoot && x.value < width.value + overshoot)
  const nearTopLeft = computed(() => nearTop.value && nearLeft.value)
  const nearTopRight = computed(() => nearTop.value && nearRight.value)
  const nearBottomLeft = computed(() => nearBottom.value && nearLeft.value)
  const nearBottomRight = computed(() => nearBottom.value && nearRight.value)
  const isNearAnyBorder = computed(() => nearLeft.value || nearRight.value || nearTop.value || nearBottom.value)

  return {
    x,
    y,
    width,
    height,
    nearLeft,
    nearRight,
    nearTop,
    nearBottom,
    nearTopLeft,
    nearTopRight,
    nearBottomLeft,
    nearBottomRight,
    isNearAnyBorder,
  }
}

export function useHostPointerPassthrough() {
  const host = initializeHostContext()
  if (host.runtime === 'kirie')
    return (enabled: boolean) => host.platform!.hostWindow.setPointerPassthrough(enabled)

  const setIgnoreMouseEvents = defineInvoke(host.context, electron.window.setIgnoreMouseEvents)
  return (enabled: boolean) => setIgnoreMouseEvents([enabled, { forward: true }])
}
