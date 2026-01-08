export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function useResize() {
  const isWin = window.platform === 'win32'

  const handleResizeStart = (e: MouseEvent, direction: ResizeDirection) => {
    if (!isWin) return
    e.preventDefault()
    e.stopPropagation()

    let lastX = e.screenX
    let lastY = e.screenY

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.screenX - lastX
      const deltaY = moveEvent.screenY - lastY

      if (deltaX !== 0 || deltaY !== 0) {
        // @ts-ignore
        window.api?.resizeWindow(deltaX, deltaY, direction)
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
    isWin,
  }
}
