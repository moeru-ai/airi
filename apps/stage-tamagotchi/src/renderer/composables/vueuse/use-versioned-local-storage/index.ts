import type { IfAny, UseStorageOptions } from '@vueuse/core'
import type { MaybeRefOrGetter, Ref, UnwrapRef } from 'vue'

import { useLocalStorage } from '@vueuse/core'
import { ref, toValue, watch } from 'vue'

interface Versioned<T> { version?: string, data?: T }
interface UseVersionedStorageOptions<T> {
  defaultVersion?: string
  satisfiesVersionBy?: (version: string) => boolean
  onVersionMismatch?: (value: Versioned<T>) => OnVersionMismatchActions<T>
}

export interface OnVersionMismatchKeep<T> { action: 'keep', data?: T }
export interface OnVersionMismatchReset<T> { action: 'reset', data?: T }
export type OnVersionMismatchActions<T> = OnVersionMismatchKeep<T> | OnVersionMismatchReset<T>

export function useVersionedLocalStorage<T>(
  key: MaybeRefOrGetter<string>,
  initialValue: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T> & UseVersionedStorageOptions<T>,
): [T] extends [Ref<any, any>] ? IfAny<T, Ref<T, T>, T> : Ref<UnwrapRef<T>, T | UnwrapRef<T>> {
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
