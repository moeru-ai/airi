import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useOptimisticMutation } from './use-optimistic'

describe('useOptimistic', () => {
  it('should perform a successful optimistic update', async () => {
    const state = ref('initial')
    const actionResult = 'real-data'

    const apply = vi.fn(() => {
      const old = state.value
      state.value = 'optimistic'
      return () => {
        state.value = old
      }
    })

    const action = vi.fn(async () => {
      return actionResult
    })

    const onSuccess = vi.fn((result: string) => {
      state.value = `final-${result}`
      return state.value
    })

    const { state: resultState, isLoading } = useOptimisticMutation({
      apply,
      action,
      onSuccess,
    })

    // Immediate check
    expect(state.value).toBe('optimistic')
    expect(apply).toHaveBeenCalled()

    // Wait for action to complete
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(action).toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledWith(actionResult)
    expect(state.value).toBe('final-real-data')
    expect(resultState.value).toBe('final-real-data')
    expect(isLoading.value).toBe(false)
  })

  it('should rollback on action failure', async () => {
    const state = ref('initial')
    const error = new Error('action failed')

    const rollback = vi.fn(() => {
      state.value = 'initial'
    })

    const apply = vi.fn(() => {
      state.value = 'optimistic'
      return rollback
    })

    const action = vi.fn(async () => {
      throw error
    })

    const { error: errorState, isLoading } = useOptimisticMutation({
      apply,
      action,
    })

    expect(state.value).toBe('optimistic')

    // Wait for failure
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(rollback).toHaveBeenCalled()
    expect(state.value).toBe('initial')
    expect(errorState.value).toBe(error)
    expect(isLoading.value).toBe(false)
  })

  it('should handle async apply and rollback', async () => {
    const state = ref('initial')

    const apply = async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      state.value = 'optimistic'
      return async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        state.value = 'initial'
      }
    }

    const action = async () => {
      throw new Error('fail')
    }

    const { execute } = useOptimisticMutation({
      apply,
      action,
    })

    await execute()

    expect(state.value).toBe('initial')
  })

  it('should not throw if apply returns non-function', async () => {
    const action = vi.fn(async () => {
      throw new Error('fail')
    })

    const { execute, error } = useOptimisticMutation({
      // @ts-expect-error - testing invalid return
      apply: () => null,
      action,
    })

    await execute()
    expect(error.value).toBeDefined()
  })
})
