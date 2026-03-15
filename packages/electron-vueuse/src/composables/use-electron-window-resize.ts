import type { ResizeDirection } from '@proj-airi/electron-eventa'

import { electron } from '@proj-airi/electron-eventa'

import { useElectronEventaInvoke } from './use-electron-eventa-context'

export function useElectronWindowResize() {
  const isWindows = useElectronEventaInvoke(electron.app.isWindows)
  const resizeWindow = useElectronEventaInvoke(electron.window.resize)

  const handleResizeStart = async (e: MouseEvent, direction: ResizeDirection) => {
    if (!await isWindows())
      return

    e.preventDefault()
    e.stopPropagation()

    let lastX = e.screenX
    let lastY = e.screenY

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.screenX - lastX
      const deltaY = moveEvent.screenY - lastY

      if (deltaX !== 0 || deltaY !== 0) {
        void resizeWindow({ deltaX, deltaY, direction })
        lastX = moveEvent.screenX
        lastY = moveEvent.screenY
      }
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return {
    handleResizeStart,
  }
}
