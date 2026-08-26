import type { StorageLike, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, Ref } from 'vue'

import { defaultWindow, useStorage } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

export type OnVersionMismatchActions<T> = OnVersionMismatchKeep<T> | OnVersionMismatchReset<T>
export interface OnVersionMismatchKeep<T> { action: 'keep', data?: T }

export interface OnVersionMismatchReset<T> { action: 'reset', data?: T }
export interface UseVersionedStorageOptions<T> {
  defaultVersion?: string
  onVersionMismatch?: (value: Versioned<T>) => OnVersionMismatchActions<T>
  satisfiesVersionBy?: (beforeVersion: string, afterVersion: string) => boolean
  storage?: StorageLike
}
export interface Versioned<T> { data?: T, version?: string }

export function useVersionedLocalStorage<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & UseVersionedStorageOptions<T>,
): Ref<T, T> {
  const defaultVersion = options?.defaultVersion || '1.0.0'
  const data = ref(toValue(initialValue)) as Ref<T, T>
  const rawValue = useStorage<Versioned<T>>(
    key,
    { data: toValue(initialValue), version: defaultVersion },
    options?.storage ?? defaultWindow?.localStorage,
    options as unknown as UseStorageOptions<Versioned<T>>,
  )

  const syncDataToStorage = watch(data, (value) => {
    rawValue.value = { data: value, version: defaultVersion }
  }, {
    deep: true,
  })

  watch(rawValue, (value) => {
    try {
      if ('version' in rawValue.value && rawValue.value.version != null) {
        if (options?.satisfiesVersionBy != null && !options.satisfiesVersionBy(rawValue.value.version, defaultVersion)) {
          if (options.onVersionMismatch != null) {
            const action = options.onVersionMismatch(rawValue.value)
            if (action.action === 'reset') {
              rawValue.value = { data: toValue(initialValue), version: defaultVersion }
              syncDataToStorage.pause()
              data.value = toValue(initialValue)
              syncDataToStorage.resume()
            }
          }
          else {
            console.warn(`version ${rawValue.value.version} doesn't satisfy the version ${defaultVersion} for key ${key}, will reset the value to default value ${toValue(initialValue)}`)
            rawValue.value = { data: toValue(initialValue), version: defaultVersion }
            syncDataToStorage.pause()
            data.value = toValue(initialValue)
            syncDataToStorage.resume()
          }
        }

        syncDataToStorage.pause()
        data.value = rawValue.value.data!
        syncDataToStorage.resume()
        return
      }

      console.warn(`property key 'version' wasn't found in the value of key ${key} as ${value}, will keep the current ${toValue(initialValue)}`)
      rawValue.value = { data: toValue(initialValue), version: defaultVersion }
      syncDataToStorage.pause()
      data.value = toValue(initialValue)
      syncDataToStorage.resume()
    }
    catch (err) {
      console.warn(`failed to un-marshal Local Storage value, possibly due to incompatible or corrupted for key ${key} value ${value}, falling back to default value ${toValue(initialValue)}`, err)
      rawValue.value = { data: toValue(initialValue), version: defaultVersion }
      syncDataToStorage.pause()
      data.value = toValue(initialValue)
      syncDataToStorage.resume()
    }
  }, {
    deep: true,
    immediate: true,
  })

  return data
}
