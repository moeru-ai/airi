import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShortcutsStore = defineStore('shortcuts', () => {
  const shortcuts = ref([
    {
      name: 'settings.shortcuts.window.move',
      shortcut: useLocalStorage('shortcuts/window/move', 'Ctrl+M'),
      group: 'window',
      type: 'move',
    },
    {
      name: 'settings.shortcuts.window.resize',
      shortcut: useLocalStorage('shortcuts/window/resize', 'Ctrl+R'),
      group: 'window',
      type: 'resize',
    },
    {
      name: 'settings.shortcuts.window.debug',
      shortcut: useLocalStorage('shortcuts/window/debug', 'Ctrl+I'),
      group: 'window',
      type: 'debug',
    },
  ])

  return {
    shortcuts,
  }
})
