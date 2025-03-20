import type { EffectScope } from 'vue'

import { useMagicKeys, whenever } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, effectScope, watch } from 'vue'

import { useShortcutsStore } from '../stores/shortcuts'
import { useWindowControlStore } from '../stores/window-controls'
import { WindowControlMode } from '../types/window-controls'

export function useWindowShortcuts() {
  const windowStore = useWindowControlStore()
  const magicKeys = useMagicKeys()

  const { shortcuts } = storeToRefs(useShortcutsStore())
  const handlers = computed(() => [
    {
      handle: () => {
        windowStore.setMode(WindowControlMode.MOVE)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'move')?.shortcut,
    },
    {
      handle: () => {
        windowStore.setMode(WindowControlMode.RESIZE)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'resize')?.shortcut,
    },
    {
      handle: () => {
        windowStore.setMode(WindowControlMode.DEBUG)
        windowStore.toggleControl()
      },
      shortcut: shortcuts.value.find(shortcut => shortcut.type === 'debug')?.shortcut,
    },
  ])

  let currentScope: EffectScope | null = null
  watch(handlers, () => {
    if (currentScope) {
      currentScope.stop()
    }

    currentScope = effectScope()
    currentScope.run(() => {
      handlers.value.forEach((handler) => {
        if (!handler.shortcut) {
          return
        }
        whenever(magicKeys[handler.shortcut], handler.handle)
      })
    })
  }, { immediate: true })
}
