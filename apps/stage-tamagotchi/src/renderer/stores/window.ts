import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { useAsyncState, useIntervalFn, useMouse, useWindowSize } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '../../shared/electron/screen'
import { bounds, startLoopGetBounds } from '../../shared/electron/window'
import { electron } from '../../shared/eventa'
import { useWindowControlStore } from './window-controls'

export function useElectronMouseEventTarget() {
  const context = ref(createContext(window.electron.ipcRenderer).context)
  const eventTarget = ref(new EventTarget())

  context.value.on(cursorScreenPoint, (event) => {
    const e = new MouseEvent('mousemove', { screenX: event.body?.x, screenY: event.body?.y })
    eventTarget.value.dispatchEvent(e)
  })

  defineInvoke(context.value!, startLoopGetCursorScreenPoint)()
  return eventTarget
}

export function useElectronMouse(options?: { x: number, y: number }) {
  const eventTarget = useElectronMouseEventTarget()
  return useMouse({ target: eventTarget, type: 'screen', initialValue: options })
}

export function useElectronAllDisplays() {
  const context = ref(createContext(window.electron.ipcRenderer).context)
  const getAllDisplays = defineInvoke(context.value, electron.screen.getAllDisplays)
  const { state: allDisplays, execute } = useAsyncState(() => getAllDisplays(), [])

  useIntervalFn(() => {
    execute()
  }, 5000)

  return allDisplays
}

export function useElectronWindowBounds() {
  const context = ref(createContext(window.electron.ipcRenderer).context)
  const windowBoundsX = ref(0)
  const windowBoundsY = ref(0)
  const windowBoundsWidth = ref(0)
  const windowBoundsHeight = ref(0)

  context.value.on(bounds, (event) => {
    if (!event || !event.body)
      return

    windowBoundsX.value = event.body.x
    windowBoundsY.value = event.body.y
    windowBoundsWidth.value = event.body.width
    windowBoundsHeight.value = event.body.height
  })

  defineInvoke(context.value!, startLoopGetBounds)()
  return {
    x: windowBoundsX,
    y: windowBoundsY,
    width: windowBoundsWidth,
    height: windowBoundsHeight,
  }
}

export function useElectronRelativeMouse(initialValue?: { x: number, y: number }) {
  const { x: mouseX, y: mouseY } = useElectronMouse(initialValue)
  const { x: windowX, y: windowY } = useElectronWindowBounds()

  // Transform screen coordinates to window-relative coordinates
  const x = computed(() => mouseX.value - windowX.value)
  const y = computed(() => mouseY.value - windowY.value)

  return { x, y }
}

export const useWindowStore = defineStore('tamagotchi-window', () => {
  const windowControlStore = useWindowControlStore()

  const { width, height } = useWindowSize()
  const centerPos = computed(() => ({ x: width.value / 2, y: height.value / 2 }))

  // Use window-relative mouse coordinates for Live2D focus
  // Transforms screen coordinates to window-relative coordinates
  const { x: live2dLookAtX, y: live2dLookAtY } = useElectronRelativeMouse(centerPos.value)

  const isCursorInside = ref(false)
  const shouldHideView = computed(() => isCursorInside.value && !windowControlStore.isControlActive && windowControlStore.isIgnoringMouseEvent)

  return {
    width,
    height,
    centerPos,
    live2dLookAtX,
    live2dLookAtY,
    isCursorInside,
    shouldHideView,
  }
})
