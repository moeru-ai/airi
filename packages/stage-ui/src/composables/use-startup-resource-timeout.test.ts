import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { useStartupResourcesStore } from '../stores/startup-resources'
import { useStartupResourceTimeout } from './use-startup-resource-timeout'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})

afterEach(() => vi.useRealTimers())

it('fails a model resource that stays loading past its deadline', async () => {
  const startup = useStartupResourcesStore()
  startup.register(['model'])
  const scope = effectScope()
  scope.run(() => useStartupResourceTimeout('model', 1000, () => 'Model load timed out'))

  startup.start('model')
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)

  expect(startup.failed?.error).toBe('Model load timed out')
  scope.stop()
})

it('clears the deadline when the model becomes ready', async () => {
  const startup = useStartupResourcesStore()
  startup.register(['model'])
  const scope = effectScope()
  scope.run(() => useStartupResourceTimeout('model', 1000, () => 'Model load timed out'))

  startup.start('model')
  await nextTick()
  startup.complete('model')
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)

  expect(startup.ready).toBe(true)
  expect(startup.failed).toBeUndefined()
  scope.stop()
})
