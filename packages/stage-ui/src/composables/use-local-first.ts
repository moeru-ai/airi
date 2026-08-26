import { getActivePinia } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from '../stores/auth'

export interface UseLocalFirstRequestOptions<T> {
  allowRemote?: () => boolean | Promise<boolean>
  lazy?: boolean
  local: () => Promise<T> | T
  remote: () => Promise<T>
}

export function useLocalFirstRequest<T>(options: UseLocalFirstRequestOptions<T>) {
  const { allowRemote, lazy = false, local, remote } = options

  const state = ref<T>()
  const isLoading = ref(false)
  const error = ref<unknown>(null)

  const execute = async () => {
    isLoading.value = true
    error.value = null
    try {
      state.value = await local()
      if (await canUseRemote(allowRemote)) {
        try {
          state.value = await remote()
        }
        catch (err) {
          error.value = err
        }
      }
    }
    catch (err) {
      error.value = err
    }
    finally {
      isLoading.value = false
    }
  }

  if (!lazy)
    execute()

  return {
    error,
    execute,
    isLoading,
    state,
  }
}

async function canUseRemote(allowRemote?: () => boolean | Promise<boolean>) {
  if (allowRemote)
    return await allowRemote()
  if (!getActivePinia())
    return true
  return useAuthStore().isAuthenticated
}
