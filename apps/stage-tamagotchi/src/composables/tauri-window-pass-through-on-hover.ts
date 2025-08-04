import type { MaybeRefOrGetter } from 'vue'

import type { AiriTamagotchiEvents, Point, WindowFrame } from './tauri'

import { onMounted, onUnmounted, ref, toValue, watch } from 'vue'

import { startClickThrough, stopClickThrough } from '../utils/windows'
import { useAppRuntime } from './runtime'
import { useTauriCore, useTauriEvent } from './tauri'

export function useTauriPointAndWindowFrame() {
  const { listen } = useTauriEvent<AiriTamagotchiEvents>()
  const { invoke } = useTauriCore()

  const unListenFuncs = ref<(() => void)[]>([])

  const mousePos = ref<Point>({ x: 0, y: 0 })
  const windowFrame = ref<WindowFrame>({
    origin: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  })

  function _onCursorPosition(event: { payload: Point }) {
    mousePos.value = event.payload
  }

  function _onWindowFrame(event: { payload: WindowFrame }) {
    windowFrame.value = event.payload
  }

  function addListeners() {
    listen('tauri-plugins:tauri-plugin-window-pass-through-on-hover:cursor-position', (event) => {
      _onCursorPosition(event)
    }).then((fn) => {
      unListenFuncs.value.push(fn)
    })

    listen('tauri-plugins:tauri-plugin-window-pass-through-on-hover:window-frame', (event) => {
      _onWindowFrame(event)
    }).then((fn) => {
      unListenFuncs.value.push(fn)
    })
  }

  onMounted(() => {
    addListeners()
    invoke('plugin:window-pass-through-on-hover|start_tracing_cursor')
  })

  onUnmounted(() => {
    unListenFuncs.value.forEach(fn => fn?.())
    unListenFuncs.value.length = 0

    invoke('plugin:window-pass-through-on-hover|stop_tracing_cursor')
  })

  if (import.meta.hot) { // For better DX
    import.meta.hot.on('vite:beforeUpdate', () => {
      unListenFuncs.value.forEach(fn => fn?.())
      unListenFuncs.value.length = 0

      invoke('plugin:window-pass-through-on-hover|stop_tracing_cursor')
    })

    import.meta.hot.on('vite:afterUpdate', () => {
      addListeners()
      invoke('plugin:window-pass-through-on-hover|start_tracing_cursor')
    })
  }

  return {
    mousePos,
    windowFrame,
  }
}

export function useTauriWindowClickThrough(live2DLookAtDefault: MaybeRefOrGetter<{ x: number, y: number }>) {
  const { platform, isInitialized } = useAppRuntime()
  const { mousePos, windowFrame } = useTauriPointAndWindowFrame()

  const live2dLookAtX = ref(toValue(live2DLookAtDefault).x)
  const live2dLookAtY = ref(toValue(live2DLookAtDefault).y)

  const isCursorInside = ref(false)

  function updateLive2DLookAt() {
    if (platform.value === 'macos') {
      live2dLookAtX.value = mousePos.value.x - windowFrame.value.origin.x
      live2dLookAtY.value = windowFrame.value.size.height - mousePos.value.y + windowFrame.value.origin.y

      return
    }

    live2dLookAtX.value = mousePos.value.x - windowFrame.value.origin.x
    live2dLookAtY.value = mousePos.value.y - windowFrame.value.origin.y
  }

  watch(mousePos, () => {
    updateLive2DLookAt()
  })

  function updateIsCursorInside() {
    isCursorInside.value
    = mousePos.value.x >= windowFrame.value.origin.x
      && mousePos.value.x <= windowFrame.value.origin.x + windowFrame.value.size.width
      && mousePos.value.y >= windowFrame.value.origin.y
      && mousePos.value.y <= windowFrame.value.origin.y + windowFrame.value.size.height
  }

  watch([mousePos, windowFrame], () => {
    updateIsCursorInside()
  })

  watch(isInitialized, async (initialized) => {
    if (initialized) {
      updateLive2DLookAt()
      updateIsCursorInside()
    }
  })

  onMounted(async () => {
    await startClickThrough()
  })

  onUnmounted(async () => {
    await stopClickThrough()
  })

  return {
    isCursorInside,
    live2dLookAtX,
    live2dLookAtY,
  }
}
