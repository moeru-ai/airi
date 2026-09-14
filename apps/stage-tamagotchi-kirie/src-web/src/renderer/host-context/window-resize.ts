import type { ResizeEdge } from '@gd-kirie/platform'
import type { ResizeDirection } from '@proj-airi/electron-eventa'

import { electron } from '@proj-airi/electron-eventa'
import { shallowRef } from 'vue'

import { initializeHostContext, useHostEventaInvoke } from './owner'

const kirieResizeEdges = {
  e: 'right',
  n: 'top',
  ne: 'top-right',
  nw: 'top-left',
  s: 'bottom',
  se: 'bottom-right',
  sw: 'bottom-left',
  w: 'left',
} satisfies Record<ResizeDirection, ResizeEdge>

export function useHostWindowResize() {
  const host = initializeHostContext()
  const isSupported = shallowRef(host.runtime === 'kirie' && window.kirie?.platform.os === 'windows')
  const resizeWindow = host.runtime === 'electron'
    ? useHostEventaInvoke(electron.window.resize)
    : undefined

  if (host.runtime === 'electron') {
    useHostEventaInvoke(electron.app.isWindows)()
      .then(supported => isSupported.value = supported)
      .catch(error => console.error('[host-context] Failed to detect window resize support.', error))
  }

  async function handleResizeStart(event: MouseEvent, direction: ResizeDirection) {
    if (!isSupported.value)
      return

    event.preventDefault()
    event.stopPropagation()

    if (host.runtime === 'kirie') {
      await host.platform!.hostWindow.beginResize(kirieResizeEdges[direction])
      return
    }

    let lastX = event.screenX
    let lastY = event.screenY

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.screenX - lastX
      const deltaY = moveEvent.screenY - lastY
      if (deltaX === 0 && deltaY === 0)
        return

      resizeWindow!({ deltaX, deltaY, direction })
        .catch(error => console.error('[host-context] Failed to resize the Electron window.', error))
      lastX = moveEvent.screenX
      lastY = moveEvent.screenY
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
    isSupported,
  }
}
