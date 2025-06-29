import type { ShortcutEvent } from '@tauri-apps/plugin-global-shortcut'

import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { until } from '@vueuse/shared'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { useShortcutsStore } from '../stores/shortcuts'
import { useAppRuntime } from './runtime'

export function useWindowShortcuts() {
  const { shortcuts } = storeToRefs(useShortcutsStore())
  const { platform, isInitialized } = useAppRuntime()

  watch(shortcuts, async () => {
    await until(isInitialized).toBeTruthy()
    if (platform.value === 'web') {
      return
    }

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
