import type { ShortcutEvent } from '@tauri-apps/plugin-global-shortcut'

import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { useShortcutsStore } from '../stores/shortcuts'

export function useWindowShortcuts() {
  const { shortcuts } = storeToRefs(useShortcutsStore())

  watch(shortcuts, async () => {
    await unregisterAll()

    for (const handler of shortcuts.value) {
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
