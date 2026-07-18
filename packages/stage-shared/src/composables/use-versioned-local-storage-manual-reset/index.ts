import type { ManualResetRefReturn, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'

import type { UseVersionedStorageOptions } from '../use-versioned-local-storage'

import { refManualReset } from '@vueuse/core'
import { unref, watch } from 'vue'

import { useVersionedLocalStorage } from '../use-versioned-local-storage'

export function useVersionedLocalStorageManualReset<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & UseVersionedStorageOptions<T>,
): ManualResetRefReturn<T> {
  const value = unref(initialValue)
  const localStorageState = useVersionedLocalStorage<T>(key, value, options)
  const state = refManualReset<T>(localStorageState)

  const { resume, pause } = watch(state, newValue => localStorageState.value = newValue, options)
  watch(localStorageState, (newValue) => {
    pause()
    state.value = newValue
    resume()
  }, options)

  return state
}
