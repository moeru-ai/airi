import type { UseOptimisticMutationOptions } from './use-optimistic'

import { getActivePinia } from 'pinia'

import { useAuthStore } from '../stores/auth'
import { useAsyncState } from './use-async-state'
import { useOptimisticMutation } from './use-optimistic'

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

  return useAsyncState(async () => {
    if (!await canUseRemote(allowRemote))
      return await local()
    return await remote()
  }, { immediate: !lazy })
}

export interface UseLocalFirstMutationOptions<T, R, E = unknown> extends UseOptimisticMutationOptions<T, R, E> {
  allowRemote?: () => boolean | Promise<boolean>
}

export function useLocalFirstMutation<T, R = T, E = unknown>(options: UseLocalFirstMutationOptions<T, R, E>) {
  const { allowRemote, skipActionIf, shouldRollback, ...rest } = options

  return useOptimisticMutation<T, R, E>({
    ...rest,
    skipActionIf: async () => {
      const localOnly = !await canUseRemote(allowRemote)
      const userSkip = skipActionIf ? await skipActionIf() : false
      return localOnly || userSkip
    },
    shouldRollback: async (error) => {
      if (!await canUseRemote(allowRemote))
        return false
      return shouldRollback ? await shouldRollback(error) : true
    },
  })
}
