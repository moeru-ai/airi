import { ref } from 'vue'

export function useAsyncState<T>(
  fn: () => Promise<T>,
  options?: {
    immediate?: boolean
  },
) {
  const { immediate = false } = options ?? {}

  const state = ref<T | undefined>(undefined) as { value: T | undefined }
  const isLoading = ref(false) as { value: boolean }
  const error = ref<unknown>(null) as { value: unknown }

  const execute = async (): Promise<void> => {
    isLoading.value = true
    error.value = null
    try {
      state.value = await fn()
    } catch (err) {
      error.value = err
    } finally {
      isLoading.value = false
    }
  }

  if (immediate) {
    void execute()
  }

  return {
    state,
    isLoading,
    error,
    execute,
  }
}
