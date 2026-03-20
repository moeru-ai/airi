import type { ResizeDirection } from '@proj-airi/electron-eventa'

import { electron } from '@proj-airi/electron-eventa'

import { useElectronEventaInvoke } from './use-electron-eventa-context'

const RESIZE_STATE_EVENT = 'airi:window-resize-state'

export function useElectronWindowResize() {
  const isWindows = useElectronEventaInvoke(electron.app.isWindows)
  const resizeWindow = useElectronEventaInvoke(electron.window.resize)

  let isResizing = false

  const emitResizeState = (active: boolean) => {
    window.dispatchEvent(new CustomEvent(RESIZE_STATE_EVENT, {
      detail: { active },
    }))
  }

  const handleResizeStart = (e: MouseEvent, direction: ResizeDirection) => {
    e.preventDefault()
    e.stopPropagation()

    if (isResizing)
      return

    void (async () => {
      if (!await isWindows())
        return

      isResizing = true
      emitResizeState(true)

      let lastX = e.screenX
      let lastY = e.screenY

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // NOTICE: prevent default on move events as well to avoid accidental selection/drag
        moveEvent.preventDefault()

        // NOTICE: In case of missed mouseup outside the window, we check if the button is still pressed.
        if (!(moveEvent.buttons & 1)) {
          handleMouseUp()
          return
        }

        const deltaX = moveEvent.screenX - lastX
        const deltaY = moveEvent.screenY - lastY

        if (deltaX !== 0 || deltaY !== 0) {
          void resizeWindow({ deltaX, deltaY, direction })
          lastX = moveEvent.screenX
          lastY = moveEvent.screenY
        }
      }

      const handleMouseUp = () => {
        isResizing = false
        emitResizeState(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('blur', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('blur', handleMouseUp)
    })()
  }

  return {
    handleResizeStart,
  }
}

export function useElectronWindowResizeStateEvent() {
  return RESIZE_STATE_EVENT
}
