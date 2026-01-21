import type { EntryKey } from '@pinia/colada'

import type { UseOptimisticMutationOptions } from './use-optimistic'

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { getActivePinia } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from '../stores/auth'

let localFirstRequestKeyCounter = 0

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
  localFirstThenRemote?: boolean
  key?: EntryKey
}

export function useLocalFirstRequest<T>(options: UseLocalFirstRequestOptions<T>) {
  const {
    local,
    remote,
    allowRemote,
    lazy = false,
    localFirstThenRemote = false,
    key,
  } = options

  const queryCache = useQueryCache()
  const queryKey = key ?? ['local-first', localFirstRequestKeyCounter++]

  if (localFirstThenRemote) {
    const query = useQuery<T>({
      key: queryKey,
      enabled: !lazy,
      query: async () => {
        let localError: unknown = null
        let localValue: T | undefined
        try {
          localValue = await local()
          queryCache.setQueryData(queryKey, localValue as T)
        }
        catch (err) {
          localError = err
        }

        if (await canUseRemote(allowRemote)) {
          return await remote()
        }

        if (localError) {
          throw localError
        }

        return localValue as T
      },
    })

    return {
      state: query.data,
      isLoading: query.isLoading,
      error: query.error,
      execute: async () => {
        await query.refetch(false)
      },
    }
  }

  const query = useQuery<T>({
    key: queryKey,
    enabled: !lazy,
    query: async () => {
      if (!await canUseRemote(allowRemote)) {
        return await local()
      }
      return await remote()
    },
  })

  return {
    state: query.data,
    isLoading: query.isLoading,
    error: query.error,
    execute: async () => {
      await query.refetch(false)
    },
  }
}

export interface UseLocalFirstMutationOptions<T, R, E = unknown> extends UseOptimisticMutationOptions<T, R, E> {
  allowRemote?: () => boolean | Promise<boolean>
}

export function useLocalFirstMutation<T, R = T, E = unknown>(options: UseLocalFirstMutationOptions<T, R, E>) {
  const { allowRemote, skipActionIf, shouldRollback, ...rest } = options
  const lastSuccess = ref<{ value: R | undefined, set: boolean }>({ value: undefined, set: false })

  const mutation = useMutation<T, void, E, { rollback?: () => Promise<void> | void, skipAction: boolean, canUseRemote: boolean }>({
    async onMutate() {
      lastSuccess.value = { value: undefined, set: false }
      const rollback = await rest.apply()
      const canRemote = await canUseRemote(allowRemote)
      const userSkip = skipActionIf ? await skipActionIf() : false
      return {
        rollback,
        skipAction: !canRemote || userSkip,
        canUseRemote: canRemote,
      }
    },
    mutation: async (_vars, context) => {
      if (context?.skipAction) {
        return undefined as unknown as T
      }
      return await rest.action()
    },
    onSuccess: async (data, _vars, context) => {
      if (context?.skipAction) {
        return
      }
      lastSuccess.value = {
        value: rest.onSuccess ? await rest.onSuccess(data) : (data as unknown as R),
        set: true,
      }
    },
    onError: async (error, _vars, context) => {
      const allowRollback = context?.canUseRemote
        ? shouldRollback
          ? await shouldRollback(error)
          : false
        : false

      if (allowRollback && context?.rollback) {
        await context.rollback()
      }

      if (rest.onError) {
        await rest.onError(error)
      }
    },
  })

  const execute = async () => {
    try {
      const result = await mutation.mutateAsync()
      if (lastSuccess.value.set) {
        return lastSuccess.value.value as R
      }
      return result as unknown as R
    }
    catch {
      return undefined as R
    }
  }

  if (!rest.lazy) {
    void execute()
  }

  return {
    state: mutation.data,
    isLoading: mutation.isLoading,
    error: mutation.error,
    execute,
  }
}
