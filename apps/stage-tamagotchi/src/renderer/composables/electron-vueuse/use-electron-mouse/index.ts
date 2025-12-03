import type { UseMouseOptions } from '@vueuse/core'

import { defineInvoke } from '@moeru/eventa'
import { useMouse } from '@vueuse/core'
import { ref } from 'vue'

import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '../../../../shared/electron/screen'
import { useElectronEventaContext } from '../use-electron-eventa-context'

export function useElectronMouseEventTarget() {
  const context = useElectronEventaContext()
  const eventTarget = ref(new EventTarget())

  context.value.on(cursorScreenPoint, (event) => {
    const e = new MouseEvent('mousemove', { screenX: event.body?.x, screenY: event.body?.y })
    eventTarget.value.dispatchEvent(e)
  })

  defineInvoke(context.value!, startLoopGetCursorScreenPoint)()
  return eventTarget
}

export function useElectronMouse(options?: UseMouseOptions) {
  const eventTarget = useElectronMouseEventTarget()
  return useMouse({ ...options, target: eventTarget, type: 'screen' })
}
