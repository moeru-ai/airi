import type { AiriTamagotchiEvents } from './tauri'

import { onMounted, onUnmounted } from 'vue'

import { KeyCode, mapKeyCode, mapKeyKey } from '../tauri/rdev'
import { useTauriEvent } from './tauri'

export function useTauriRdevEventTarget(): EventTarget {
  const unListenFuncs: (() => void)[] = []
  const eventTarget = new EventTarget()

  const { listen } = useTauriEvent<AiriTamagotchiEvents>()

  async function setup() {
    window.addEventListener('keyup', (event) => {
      event.preventDefault()
      event.stopPropagation()

      const e = new KeyboardEvent('keyup', {
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      })
      eventTarget.dispatchEvent(e)
    })

    window.addEventListener('keydown', (event) => {
      event.preventDefault()
      event.stopPropagation()

      const e = new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      })
      eventTarget.dispatchEvent(e)
    })

    unListenFuncs.push(await listen('tauri-plugins:tauri-plugin-rdev:mousemove', (event) => {
      if (event.payload.event_type.MouseMove) {
        const { x, y } = event.payload.event_type.MouseMove
        const e = new MouseEvent('mousemove', {
          clientX: x,
          clientY: y,
        })
        eventTarget.dispatchEvent(e)
      }
    }))

    unListenFuncs.push(await listen('tauri-plugins:tauri-plugin-rdev:keyup', (event) => {
      if (typeof event.payload.event_type.KeyRelease === 'object' && 'Unknown' in event.payload.event_type.KeyRelease) {
        if (event.payload.event_type.KeyRelease.Unknown === 62) {
          event.payload.event_type = { KeyRelease: KeyCode.ControlLeft }
        }
      }
      if (typeof event.payload.event_type.KeyRelease !== 'string') {
        console.warn('unknown key release event:', event.payload.event_type.KeyRelease)
        return
      }

      const e = new KeyboardEvent('keyup', {
        key: mapKeyKey[event.payload.event_type.KeyRelease],
        code: mapKeyCode[event.payload.event_type.KeyRelease],
        metaKey: mapKeyKey[event.payload.event_type.KeyRelease] === 'Meta',
        ctrlKey: mapKeyKey[event.payload.event_type.KeyRelease] === 'Control',
        altKey: mapKeyKey[event.payload.event_type.KeyRelease] === 'Alt',
        shiftKey: mapKeyKey[event.payload.event_type.KeyRelease] === 'Shift',
      })

      eventTarget.dispatchEvent(e)
    }))

    unListenFuncs.push(await listen('tauri-plugins:tauri-plugin-rdev:keydown', (event) => {
      if (typeof event.payload.event_type.KeyPress === 'object' && 'Unknown' in event.payload.event_type.KeyPress) {
        if (event.payload.event_type.KeyPress.Unknown === 62) {
          event.payload.event_type = { KeyPress: KeyCode.ControlLeft }
        }
      }
      if (typeof event.payload.event_type.KeyPress !== 'string') {
        console.warn('unknown key release event:', event.payload.event_type.KeyPress)
        return
      }

      const e = new KeyboardEvent('keydown', {
        key: mapKeyKey[event.payload.event_type.KeyPress],
        code: mapKeyCode[event.payload.event_type.KeyPress],
        metaKey: mapKeyKey[event.payload.event_type.KeyPress] === 'Meta',
        ctrlKey: mapKeyKey[event.payload.event_type.KeyPress] === 'Control',
        altKey: mapKeyKey[event.payload.event_type.KeyPress] === 'Alt',
        shiftKey: mapKeyKey[event.payload.event_type.KeyPress] === 'Shift',
      })

      eventTarget.dispatchEvent(e)
    }))
  }

  function cleanup() {
    unListenFuncs.forEach(unListen => unListen())
    unListenFuncs.length = 0
  }

  onMounted(() => setup())
  onUnmounted(() => cleanup())

  if (import.meta.hot) { // For better DX
    import.meta.hot.on('vite:beforeUpdate', () => cleanup())
    import.meta.hot.on('vite:afterUpdate', async () => await setup())
  }

  return eventTarget
}
