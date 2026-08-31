import type { ManualResetRefReturn, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, WatchOptions } from 'vue'

import { refManualReset, useLocalStorage } from '@vueuse/core'
import { toRaw, unref, watch } from 'vue'

export function useLocalStorageManualReset<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & WatchOptions,
): ManualResetRefReturn<T> {
  const value = unref(initialValue)
  const localStorageState = useLocalStorage<T>(key, value, options)
  const state = refManualReset<T>(localStorageState)

  const { resume, pause } = watch(state, newValue => localStorageState.value = newValue, options)
  if (options?.listenToStorageChanges !== false) {
    watch(localStorageState, (newValue) => {
      // Writing state to useStorage updates this ref with the same value. A
      // manual ref triggers even when assigned the same reference, so reflecting
      // that write would publish a second Pinia mutation. Only storage-originated
      // values need to cross this boundary.
      if (toRaw(newValue) === toRaw(state.value))
        return

      pause()
      state.value = newValue
      resume()
    }, options)
  }

  return state
}
