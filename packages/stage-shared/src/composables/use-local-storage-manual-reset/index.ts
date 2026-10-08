import type { ManualResetRefReturn, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, WatchOptions } from 'vue'

import { refManualReset, useLocalStorage } from '@vueuse/core'
import { toRaw, toValue, watch } from 'vue'

export function useLocalStorageManualReset<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & WatchOptions,
): ManualResetRefReturn<T> {
  // The storage ref wraps its default in a deep reactive proxy, so in-place
  // writes such as `state.value.x = 1` change that object. A getter returns a
  // new value on each call. Other values are copied.
  const copyInitialValue = (): T => typeof initialValue === 'function'
    ? toValue(initialValue)
    : structuredClone(toRaw(toValue(initialValue)))

  const localStorageState = useLocalStorage<T>(key, copyInitialValue(), options)
  const state = refManualReset<T>(localStorageState)

  // `refManualReset` resets to its source, and the source is the storage ref.
  // So write the default to storage first. The state then reads the reactive
  // proxy back, and later in-place writes still reach storage.
  const resetToStoredValue = state.reset
  state.reset = () => {
    localStorageState.value = copyInitialValue()
    resetToStoredValue()
  }

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
