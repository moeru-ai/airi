import type { Position, UseMouseOptions } from '@vueuse/core'

import { defineInvoke } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { useMouse } from '@vueuse/core'
import { ref } from 'vue'

import { getElectronEventaContext } from './use-electron-eventa-context'

let sharedEventTarget: EventTarget | undefined
// The main process sends a position only when it changes. A consumer that mounts while the cursor stays still starts
// from this position, because no later message brings it one.
let lastPosition: Position | undefined
let startedTracking = false

export function useElectronMouseEventTarget() {
  const context = getElectronEventaContext()

  if (!sharedEventTarget) {
    sharedEventTarget = new EventTarget()

    context.on(cursorScreenPoint, (event) => {
      if (event.body)
        lastPosition = { x: event.body.x, y: event.body.y }
      const e = new MouseEvent('mousemove', { screenX: event.body?.x, screenY: event.body?.y })
      sharedEventTarget?.dispatchEvent(e)
    })
  }

  if (!startedTracking) {
    startedTracking = true
    void defineInvoke(context, startLoopGetCursorScreenPoint)()
  }

  return ref(sharedEventTarget)
}

export function useElectronMouse(options?: UseMouseOptions) {
  const eventTarget = useElectronMouseEventTarget()
  return useMouse({ ...options, initialValue: lastPosition ?? options?.initialValue, target: eventTarget, type: 'screen' })
}
