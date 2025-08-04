import { useMagicKeys } from '@vueuse/core'
import { until, whenever } from '@vueuse/shared'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

import { useShortcutsStore } from '../stores/shortcuts'
import { useAppRuntime } from './runtime'
import { useTauriRdevEventTarget } from './tauri-rdev'

export function useTauriGlobalShortcuts() {
  const { shortcuts } = storeToRefs(useShortcutsStore())
  const { platform, isInitialized } = useAppRuntime()
  const eventTarget = useTauriRdevEventTarget()
  const keys = useMagicKeys({ target: eventTarget })

  watch(shortcuts, async () => {
    await until(isInitialized).toBeTruthy()
    if (platform.value === 'web') {
      return
    }

    for (const handler of shortcuts.value) {
      if (!handler.shortcut) {
        return
      }

      whenever(keys[handler.shortcut], async () => {
        handler.handle().catch((error) => {
          console.error('Error handling shortcut', error)
        })
      })
    }
  }, { immediate: true })
}
