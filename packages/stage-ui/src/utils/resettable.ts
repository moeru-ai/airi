import { useLocalStorage } from '@vueuse/core'
import { ref } from 'vue'

const structuredCloneFn: (<T>(value: T) => T) | undefined = (globalThis as any).structuredClone

function cloneDefault<T>(value: T): T {
  if (typeof structuredCloneFn === 'function')
    return structuredCloneFn(value)

  if (value instanceof Map)
    return new Map(value) as unknown as T

  if (Array.isArray(value))
    return value.map(item => cloneDefault(item)) as unknown as T

  if (value && typeof value === 'object')
    return JSON.parse(JSON.stringify(value)) as T

  return value
}

export function createResettableRef<T>(initialValue: T) {
  const state = ref<T>(cloneDefault(initialValue))
  const reset = () => {
    state.value = cloneDefault(initialValue)
  }
  return [state, reset] as const
}

export function createResettableLocalStorage<T>(key: string, initialValue: T) {
  const state = useLocalStorage<T>(key, cloneDefault(initialValue))
  const reset = () => {
    state.value = cloneDefault(initialValue)
  }
  return [state, reset] as const
}
