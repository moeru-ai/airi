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
  // writes such as `state.value.x = 1` change that object. Each call returns a
  // new copy, so `reset()` always gets the value the caller passed in.
  const copyInitialValue = () => structuredClone(toRaw(toValue(initialValue)))

  const localStorageState = useLocalStorage<T>(key, copyInitialValue(), options)
  // `reset()` reads its source again. The source must be the default, not the
  // storage ref, because the storage ref already holds the current value.
  const state = refManualReset<T>(copyInitialValue)
  state.value = localStorageState.value

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
