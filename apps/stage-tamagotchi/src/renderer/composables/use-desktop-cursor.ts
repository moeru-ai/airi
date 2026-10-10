import { startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useEventListener, useIntervalFn, useWindowSize } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import { useDesktopCompanionStore } from '../stores/desktop-companion'

/** Uses Electron DIP samples when supported. Native Wayland uses recent pointer events inside this window only. */
export function useDesktopCursor() {
  const desktop = useDesktopCompanionStore()
  const { width, height } = useWindowSize()
  const local = ref<{ x: number, y: number }>()
  const lastLocalAt = ref(0)
  const now = ref(Date.now())
  const startCursor = useElectronEventaInvoke(startLoopGetCursorScreenPoint)
  const globalAvailable = computed(() => desktop.capabilities?.globalCursor === 'available')

  useEventListener(window, 'pointermove', (event) => {
    local.value = { x: event.clientX, y: event.clientY }
    lastLocalAt.value = Date.now()
    now.value = lastLocalAt.value
  })
  useEventListener(document.documentElement, 'pointerleave', () => local.value = undefined)
  useEventListener(window, 'blur', () => local.value = undefined)
  useEventListener(document, 'visibilitychange', () => {
    if (document.hidden)
      local.value = undefined
  })
  // A lost leave event or a stalled IPC stream returns gaze to neutral instead of preserving stale coordinates.
  useIntervalFn(() => now.value = Date.now(), 250)
  watch(globalAvailable, (available) => {
    if (available)
      void startCursor().catch(() => {})
  }, { immediate: true })

  const sampledPoint = computed(() => {
    if (globalAvailable.value && desktop.cursor && now.value - desktop.cursor.sampledAt < 2000)
      return desktop.cursor.localCss
    if (!globalAvailable.value && local.value && now.value - lastLocalAt.value < 2000)
      return local.value
    return undefined
  })
  const hasFreshSample = computed(() => Boolean(sampledPoint.value))
  const center = computed(() => ({ x: width.value / 2, y: height.value / 2 }))
  const point = computed(() => sampledPoint.value ?? center.value)
  const isOutsideWindow = computed(() => !sampledPoint.value || sampledPoint.value.x < 0 || sampledPoint.value.y < 0 || sampledPoint.value.x > width.value || sampledPoint.value.y > height.value)
  const isAroundWindowBorder = computed(() => {
    const sample = sampledPoint.value
    if (!sample)
      return false
    const nearVertical = (Math.abs(sample.x) <= 10 || Math.abs(sample.x - width.value) <= 10) && sample.y > -10 && sample.y < height.value + 10
    const nearHorizontal = (Math.abs(sample.y) <= 10 || Math.abs(sample.y - height.value) <= 10) && sample.x > -10 && sample.x < width.value + 10
    return nearVertical || nearHorizontal
  })
  return { x: computed(() => point.value.x), y: computed(() => point.value.y), globalAvailable, hasFreshSample, isOutsideWindow, isAroundWindowBorder }
}
