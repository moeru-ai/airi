import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { useMouse } from '@vueuse/core'
import { ref } from 'vue'

import { electronMousePosition, electronStartTrackMousePosition } from '../../shared/eventa'

export function useWindowMouse(options?: { x: number, y: number }) {
  const eventTarget = useElectronMouseEventTarget()
  return useMouse({ target: eventTarget, type: 'screen', initialValue: options })
}

export function useElectronMouseEventTarget() {
  const context = ref(createContext(window.electron.ipcRenderer).context)
  const eventTarget = ref(new EventTarget())

  context.value.on(electronMousePosition, (event) => {
    const e = new MouseEvent('mousemove', { screenX: event.body?.x, screenY: event.body?.y })
    eventTarget.value.dispatchEvent(e)
  })

  defineInvoke(context.value!, electronStartTrackMousePosition)()
  return eventTarget
}
