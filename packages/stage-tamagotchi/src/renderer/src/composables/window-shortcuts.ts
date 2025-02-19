import { onMounted, onUnmounted } from 'vue'

import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'

export function useWindowShortcuts() {
  const windowStore = useWindowControlStore()

  function handleKeydown(event: KeyboardEvent) {
    // Ctrl/Cmd + Shift + D for debug mode
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'd') {
      windowStore.setMode(WindowControlMode.DEBUG)
      windowStore.toggleControl()
    }
    // Ctrl/Cmd + M for move mode
    if ((event.ctrlKey || event.metaKey) && event.key === 'm') {
      windowStore.setMode(WindowControlMode.MOVE)
      windowStore.toggleControl()
    }
    // Ctrl/Cmd + R for resize mode
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
      windowStore.setMode(WindowControlMode.RESIZE)
      windowStore.toggleControl()
    }
    // Escape to exit any mode
    if (event.key === 'Escape') {
      windowStore.setMode(WindowControlMode.DEFAULT)
      windowStore.toggleControl()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
