import { ref } from 'vue'

export function useAsyncState<T>(
  fn: () => Promise<T>,
  options?: {
    immediate?: boolean
  },
) {
  const { immediate = false } = options ?? {}

  const state = ref<T | undefined>(undefined)
  const isLoading = ref(false)
  const error = ref<unknown>(null)

  const execute = async () => {
    isLoading.value = true
    error.value = null
    try {
      state.value = await fn()
    }
    catch (err) {
      error.value = err
    }
    finally {
      isLoading.value = false
    }
  }

  if (immediate) {
    execute()
  }

  return {
    state,
    isLoading,
    error,
    execute,
  }
}
