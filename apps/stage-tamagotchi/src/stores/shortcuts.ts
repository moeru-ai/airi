import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShortcutsStore = defineStore('shortcuts', () => {
  const shortcuts = ref([
    {
      name: 'settings.pages.themes.window-shortcuts.toggle-move.label',
      shortcut: useLocalStorage('shortcuts/window/move', 'Ctrl+M'),
      group: 'window',
      type: 'move',
    },
    {
      name: 'settings.pages.themes.window-shortcuts.toggle-resize.label',
      shortcut: useLocalStorage('shortcuts/window/resize', 'Ctrl+R'),
      group: 'window',
      type: 'resize',
    },
    {
      name: 'settings.pages.themes.window-shortcuts.toggle-ignore-mouse-event.label',
      shortcut: useLocalStorage('shortcuts/window/debug', 'Ctrl+I'),
      group: 'window',
      type: 'debug',
    },
  ])

  return {
    shortcuts,
  }
})
