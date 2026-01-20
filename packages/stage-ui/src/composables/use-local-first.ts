import type { UseOptimisticMutationOptions } from './use-optimistic'

import { getActivePinia } from 'pinia'
import { toast } from 'vue-sonner'

import { useAuthStore } from '../stores/auth'
import { useAsyncState } from './use-async-state'
import { useOptimisticMutation } from './use-optimistic'
import { enqueueOutbox, useOutboxQueue } from './use-outbox-queue'

async function canUseRemote(allowRemote?: () => boolean | Promise<boolean>, online?: boolean) {
  if (allowRemote && !await allowRemote())
    return false
  if (online === false)
    return false
  if (!getActivePinia())
    return true
  return useAuthStore().isAuthenticated
}

function notifyQueuedRetry() {
  toast.info('Queued for retry when back online.')
}

function resolveOutboxPayload<T>(payload: T | (() => T)) {
  return typeof payload === 'function' ? payload() : payload
}

export interface LocalFirstOutboxOptions<T> {
  type: string
  payload: T | (() => T)
}

export interface UseLocalFirstRequestOptions<T> {
  local: () => Promise<T> | T
  remote: () => Promise<T>
  allowRemote?: () => boolean | Promise<boolean>
  outbox?: LocalFirstOutboxOptions<unknown>
  lazy?: boolean
}

export function useLocalFirstRequest<T>(options: UseLocalFirstRequestOptions<T>) {
  const { local, remote, allowRemote, outbox, lazy = false } = options
  const { online } = useOutboxQueue()

  return useAsyncState(async () => {
    const localResult = await local()
    const canRemote = await canUseRemote(allowRemote, online.value)
    if (!canRemote) {
      if (outbox) {
        await enqueueOutbox(outbox.type, resolveOutboxPayload(outbox.payload))
        notifyQueuedRetry()
      }
      return localResult
    }
    try {
      return await remote()
    }
    catch (error) {
      if (outbox) {
        await enqueueOutbox(outbox.type, resolveOutboxPayload(outbox.payload), error)
        notifyQueuedRetry()
        return localResult
      }
      throw error
    }
  }, { immediate: !lazy })
}

export interface UseLocalFirstMutationOptions<T, R, E = unknown> extends UseOptimisticMutationOptions<T, R, E> {
  allowRemote?: () => boolean | Promise<boolean>
  outbox?: LocalFirstOutboxOptions<unknown>
}

export function useLocalFirstMutation<T, R = T, E = unknown>(options: UseLocalFirstMutationOptions<T, R, E>) {
  const {
    allowRemote,
    skipActionIf,
    onError,
    outbox,
    ...rest
  } = options
  const { online } = useOutboxQueue()
  const enqueueRetry = async (error?: unknown) => {
    if (!outbox)
      return
    await enqueueOutbox(outbox.type, resolveOutboxPayload(outbox.payload), error)
    notifyQueuedRetry()
  }

  return useOptimisticMutation<T, R, E>({
    ...rest,
    skipActionIf: async () => {
      const localOnly = !await canUseRemote(allowRemote, online.value)
      const userSkip = skipActionIf ? await skipActionIf() : false
      if (localOnly) {
        await enqueueRetry()
      }
      return localOnly || userSkip
    },
    shouldRollback: async () => false,
    onError: async (error) => {
      await enqueueRetry(error)
      if (onError)
        await onError(error)
    },
  })
}
