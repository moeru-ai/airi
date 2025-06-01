import type { ShortcutEvent } from '@tauri-apps/plugin-global-shortcut'

import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'

import { useShortcutsStore } from '../stores/shortcuts'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'
import { startClickThrough, stopClickThrough } from '../utils/windows'

export function useWindowShortcuts() {
  const windowStore = useWindowControlStore()

  const { shortcuts } = storeToRefs(useShortcutsStore())
  const handlers = computed(() => [
    {
      handle: async (event: ShortcutEvent) => {
        if (event.state !== 'Pressed') {
          return
        }

        windowStore.setMode(WindowControlMode.MOVE)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'move')?.shortcut,
    },
    {
      handle: async (event: ShortcutEvent) => {
        if (event.state !== 'Pressed') {
          return
        }

        windowStore.setMode(WindowControlMode.RESIZE)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'resize')?.shortcut,
    },
    {
      handle: async (event: ShortcutEvent) => {
        if (event.state !== 'Pressed') {
          return
        }

        windowStore.setMode(WindowControlMode.DEBUG)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'debug')?.shortcut,
    },
    {
      handle: async (event: ShortcutEvent) => {
        if (event.state === 'Pressed') {
          stopClickThrough()
          return
        }

        startClickThrough()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'ignore-mouse-event')?.shortcut,
    },
  ])

  watch(handlers, async () => {
    await unregisterAll()

    for (const handler of handlers.value) {
      if (!handler.shortcut) {
        return
      }

      await register(handler.shortcut
        .replaceAll('Meta', 'CommandOrControl')
        .replaceAll('meta', 'CommandOrControl')
        .replaceAll('Ctrl', 'CommandOrControl')
        .replaceAll('ctrl', 'CommandOrControl')
        .replaceAll('Option', 'OptionOrAlt')
        .replaceAll('option', 'OptionOrAlt'), (event: ShortcutEvent) => {
        if (event.state !== 'Pressed') {
          return
        }

        handler.handle(event).catch((error) => {
          console.error('Error handling shortcut', error)
        })
      })
    }
  }, { immediate: true })
}
