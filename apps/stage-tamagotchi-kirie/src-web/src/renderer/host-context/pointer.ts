import type { MaybeElementRef } from '@vueuse/core'

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
    const deviceScale = window.devicePixelRatio

    pointerX.value = pointer.x / deviceScale
    pointerY.value = pointer.y / deviceScale
    pointerInsideWindow.value = pointer.inside

    if (windowBounds) {
      windowBoundsX.value = windowBounds.x / deviceScale
      windowBoundsY.value = windowBounds.y / deviceScale
      windowBoundsWidth.value = windowBounds.width / deviceScale
      windowBoundsHeight.value = windowBounds.height / deviceScale
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

export function useHostRelativeMouse() {
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
  }
}

export function useHostMouseInElement(target?: MaybeElementRef) {
  const { x, y } = useHostRelativeMouse()
  const targetRef = shallowRef(target ?? defaultWindow?.document.body)
  const isOutside = shallowRef(true)

  function update() {
    if (!defaultWindow)
      return

    const element = unrefElement(targetRef)
    if (!element || !(element instanceof Element))
      return

    const { left, top, width, height } = element.getBoundingClientRect()
    const elementX = x.value - left
    const elementY = y.value - top
    isOutside.value = width === 0
      || height === 0
      || elementX < 0
      || elementY < 0
      || elementX > width
      || elementY > height
  }

  tryOnMounted(update)

  if (defaultWindow) {
    useResizeObserver(targetRef, update)
    useMutationObserver(targetRef, update, {
      attributeFilter: ['style', 'class'],
    })
    watch([targetRef, x, y], update)
    useEventListener(defaultWindow.document, 'mouseleave', () => isOutside.value = true, { passive: true })
    useEventListener(defaultWindow, 'scroll', update, { capture: true, passive: true })
    useEventListener(defaultWindow, 'resize', update, { passive: true })
  }

  return {
    isOutside,
  }
}

export function useHostMouseInWindow() {
  const mouse = useHostRelativeMouse()
  const { width, height } = useHostWindowBounds()
  const isOutside = computed(() => !pointerInsideWindow.value
    || mouse.x.value < 0
    || mouse.y.value < 0
    || mouse.x.value > width.value
    || mouse.y.value > height.value)

  return {
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
  const isNearAnyBorder = computed(() => nearLeft.value || nearRight.value || nearTop.value || nearBottom.value)

  return {
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
