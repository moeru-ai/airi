import type { ManualResetRefReturn, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, WatchOptions } from 'vue'

import { refManualReset, useLocalStorage } from '@vueuse/core'
import { unref, watch } from 'vue'

export function useLocalStorageManualReset<T>(key: MaybeRefOrGetter<string>, initialValue: MaybeRefOrGetter<T>, options?: UseStorageOptions<T> & WatchOptions): ManualResetRefReturn<T> {
  const value = unref(initialValue)
  const localStorageState = useLocalStorage<T>(key, value, options)
  const state = refManualReset<T>(localStorageState)

  const { resume, pause } = watch(state, newValue => localStorageState.value = newValue, options)
  watch(localStorageState, (newValue) => {
    pause()
    state.value = newValue
    resume()
  }, options)

  return state
}
