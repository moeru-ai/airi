import type { MaybeRefOrGetter, UseStorageOptions } from '@vueuse/core'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, toValue, watch } from 'vue'

import { WindowControlMode } from '../types/window-controls'
import { useWindowControlStore } from './window-controls'

interface Versioned<T> { version?: string, data?: T }
interface UseVersionedStorageOptions<T> {
  defaultVersion?: string
  satisfiesVersionBy?: (version: string) => boolean
  onVersionMismatch?: (value: Versioned<T>) => OnVersionMismatchActions<T>
}

export interface OnVersionMismatchKeep<T> { action: 'keep', data?: T }
export interface OnVersionMismatchReset<T> { action: 'reset', data?: T }
export type OnVersionMismatchActions<T> = OnVersionMismatchKeep<T> | OnVersionMismatchReset<T>

function useVersionedLocalStorage<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & UseVersionedStorageOptions<T>,
) {
  const defaultVersion = options?.defaultVersion || '1.0.0'
  const data = ref(toValue(initialValue))
  const rawValue = useLocalStorage<Versioned<T>>(key, { version: defaultVersion, data: toValue(initialValue) }, options as unknown as UseStorageOptions<Versioned<T>>)

  watch(rawValue, (value) => {
    try {
      if ('version' in rawValue.value && rawValue.value.version != null) {
        if (options?.satisfiesVersionBy != null && !options.satisfiesVersionBy(rawValue.value.version)) {
          if (options.onVersionMismatch != null) {
            const action = options.onVersionMismatch(rawValue.value)
            if (action.action === 'reset') {
              rawValue.value = { version: defaultVersion, data: toValue(initialValue) }
              data.value = toValue(initialValue)
            }
          }
          else {
            console.warn(`version ${rawValue.value.version} doesn't satisfy the version ${options.defaultVersion} for key ${key}, will reset the value to default value ${toValue(initialValue)}`)
            rawValue.value = { version: defaultVersion, data: toValue(initialValue) }
            data.value = toValue(initialValue)
          }
        }

        data.value = rawValue.value.data
        return
      }

      console.warn(`property key 'version' wasn't found in the value of key ${key} as ${value}, will keep the current ${toValue(initialValue)}`)
      rawValue.value = { version: defaultVersion, data: toValue(initialValue) }
      data.value = toValue(initialValue)
    }
    catch (err) {
      console.warn(`failed to un-marshal Local Storage value, possibly due to incompatible or corrupted for key ${key} value ${value}, falling back to default value ${toValue(initialValue)}`, err)
      rawValue.value = { version: defaultVersion, data: toValue(initialValue) }
      data.value = toValue(initialValue)
    }
  }, {
    immediate: true,
    deep: true,
  })

  return data
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  const windowStore = useWindowControlStore()

  const shortcuts = ref([
    {
      name: 'tamagotchi.settings.pages.themes.window-shortcuts.toggle-move.label',
      shortcut: useVersionedLocalStorage('shortcuts/window/move', 'Shift+Alt+N', { defaultVersion: '1.0.2', satisfiesVersionBy: v => v === '1.0.2', onVersionMismatch: () => ({ action: 'reset' }) }), // Shift + Alt + N
      group: 'window',
      type: 'move',
      handle: async () => {
        windowStore.toggleMode(WindowControlMode.MOVE)
      },
    },
    {
      name: 'tamagotchi.settings.pages.themes.window-shortcuts.toggle-resize.label',
      shortcut: useVersionedLocalStorage('shortcuts/window/resize', 'Shift+Alt+A', { defaultVersion: '1.0.2', satisfiesVersionBy: v => v === '1.0.2', onVersionMismatch: () => ({ action: 'reset' }) }), // Shift + Alt + A
      group: 'window',
      type: 'resize',
      handle: async () => {
        windowStore.toggleMode(WindowControlMode.RESIZE)
      },
    },
    {
      name: 'tamagotchi.settings.pages.themes.window-shortcuts.toggle-ignore-mouse-event.label',
      shortcut: useVersionedLocalStorage('shortcuts/window/debug', 'Shift+Alt+I', { defaultVersion: '1.0.2', satisfiesVersionBy: v => v === '1.0.2', onVersionMismatch: () => ({ action: 'reset' }) }), // Shift + Alt + I
      group: 'window',
      type: 'ignore-mouse-event',
      handle: async () => {
        windowStore.isIgnoringMouseEvent = !windowStore.isIgnoringMouseEvent
      },
    },
  ])

  return {
    shortcuts,
  }
})
