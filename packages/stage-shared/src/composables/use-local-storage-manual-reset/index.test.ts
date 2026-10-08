// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, watch } from 'vue'

import { useLocalStorageManualReset } from '.'

afterEach(() => {
  localStorage.clear()
})

describe('useLocalStorageManualReset', () => {
  // ROOT CAUSE:
  //
  // A synchronized store replaced a Map with a structured clone. Persistence
  // serialized that value, then the storage ref reflected another Map clone
  // into the store. Pinia saw the reflection as a new direct mutation and
  // published another domain snapshot.
  //
  // We fixed this by making `listenToStorageChanges: false` one-way: state is
  // still persisted, but the storage ref cannot write back into live state.
  it('does not reflect persisted values when storage listening is disabled', async () => {
    const state = useLocalStorageManualReset('cards', new Map<string, string>(), {
      listenToStorageChanges: false,
    })
    let changes = 0
    const stop = watch(state, () => {
      changes += 1
    }, { flush: 'sync' })

    state.value = new Map([['card-1', 'ReLU']])
    await nextTick()

    expect(changes).toBe(1)
    expect(state.value).toEqual(new Map([['card-1', 'ReLU']]))
    stop()
  })

  // ROOT CAUSE:
  //
  // `refManualReset` resets to `toValue(source)`, and the source was the
  // storage ref. So `reset()` assigned the value that storage already held.
  //
  // refManualReset<T>(localStorageState)
  //
  // We fixed this by making a copy of the initial value the reset source.
  // refManualReset<T>(copyInitialValue)
  it('restores the initial value and stores it when reset', async () => {
    const state = useLocalStorageManualReset('provider', 'default')

    state.value = 'changed'
    await nextTick()
    expect(localStorage.getItem('provider')).toBe('changed')

    state.reset()
    await nextTick()

    expect(state.value).toBe('default')
    expect(localStorage.getItem('provider')).toBe('default')
  })

  it('restores the initial value when storage held a value before the ref was created', async () => {
    localStorage.setItem('provider', 'stored')
    const state = useLocalStorageManualReset('provider', 'default')
    expect(state.value).toBe('stored')

    state.reset()
    await nextTick()

    expect(state.value).toBe('default')
    expect(localStorage.getItem('provider')).toBe('default')
  })

  // ROOT CAUSE:
  //
  // The storage ref wraps an object default in a deep reactive proxy. So an
  // in-place write also changed the object that the caller passed in.
  //
  // We fixed this by giving storage and each reset a new copy of the default.
  it('restores an object initial value after an in-place write', async () => {
    const state = useLocalStorageManualReset('offset', { x: 0, y: 0 })

    state.value.x = 5
    await nextTick()

    state.reset()
    await nextTick()

    expect(state.value).toEqual({ x: 0, y: 0 })
    expect(localStorage.getItem('offset')).toBe('{"x":0,"y":0}')
  })
})
