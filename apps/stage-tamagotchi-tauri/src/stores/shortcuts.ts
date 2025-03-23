import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShortcutsStore = defineStore('shortcuts', () => {
  const shortcuts = ref([
    {
      name: 'settings.pages.shortcuts.sections.section.window-controls.fields.field.toggle-move.label',
      shortcut: useLocalStorage('shortcuts/window/move', 'Ctrl+M'),
      group: 'window',
      type: 'move',
    },
    {
      name: 'settings.pages.shortcuts.sections.section.window-controls.fields.field.toggle-resize.label',
      shortcut: useLocalStorage('shortcuts/window/resize', 'Ctrl+R'),
      group: 'window',
      type: 'resize',
    },
    {
      name: 'settings.pages.shortcuts.sections.section.window-controls.fields.field.toggle-ignore-mouse-event.label',
      shortcut: useLocalStorage('shortcuts/window/debug', 'Ctrl+I'),
      group: 'window',
      type: 'debug',
    },
  ])

  return {
    shortcuts,
  }
})
