import { getActivePinia } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from '../stores/auth'

async function canUseRemote(allowRemote?: () => boolean | Promise<boolean>) {
  if (allowRemote)
    return await allowRemote()
  if (!getActivePinia())
    return true
  return useAuthStore().isAuthenticated
}

export interface UseLocalFirstRequestOptions<T> {
  local: () => Promise<T> | T
  remote: () => Promise<T>
  allowRemote?: () => boolean | Promise<boolean>
  lazy?: boolean
}

export function useLocalFirstRequest<T>(options: UseLocalFirstRequestOptions<T>) {
  const { local, remote, allowRemote, lazy = false } = options

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
    state,
    isLoading,
    error,
    execute,
  }
}
