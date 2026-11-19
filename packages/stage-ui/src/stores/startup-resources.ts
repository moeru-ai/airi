import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type StartupResourceStatus = 'queued' | 'loading' | 'ready' | 'failed' | 'skipped'

export interface StartupResource {
  id: string
  status: StartupResourceStatus
  error?: string
}

/** Owns one page load's resource states. Register the full list before work starts. */
export const useStartupResourcesStore = defineStore('startup-resources', () => {
  const resources = ref<StartupResource[]>([])
  let generation = 0
  const progress = computed(() => resources.value.length === 0
    ? 0
    : Math.round(resources.value.filter(resource => resource.status === 'ready' || resource.status === 'skipped').length / resources.value.length * 100))
  const failed = computed(() => resources.value.find(resource => resource.status === 'failed'))
  const ready = computed(() => resources.value.length > 0 && resources.value.every(resource => resource.status === 'ready' || resource.status === 'skipped'))

  function register(ids: readonly string[]) {
    if (resources.value.length > 0)
      throw new Error('Startup resources are already registered')
    if (new Set(ids).size !== ids.length)
      throw new Error('Startup resource IDs must be unique')
    resources.value = ids.map(id => ({ id, status: 'queued' }))
  }

  function reset() {
    generation += 1
    resources.value = []
  }

  function resource(id: string) {
    const item = resources.value.find(item => item.id === id)
    if (!item)
      throw new Error(`Unknown startup resource: ${id}`)
    return item
  }

  function start(id: string) {
    const item = resource(id)
    if (item.status !== 'queued')
      throw new Error(`Cannot start ${id} from ${item.status}`)
    item.status = 'loading'
  }

  function complete(id: string) {
    const item = resource(id)
    if (item.status !== 'loading')
      throw new Error(`Cannot complete ${id} from ${item.status}`)
    item.status = 'ready'
  }

  function fail(id: string, error: unknown) {
    const item = resource(id)
    if (item.status !== 'loading')
      throw new Error(`Cannot fail ${id} from ${item.status}`)
    item.status = 'failed'
    item.error = errorMessageFrom(error)
  }

  function skip(id: string) {
    const item = resource(id)
    if (item.status !== 'queued' && item.status !== 'failed')
      throw new Error(`Cannot skip ${id} from ${item.status}`)
    item.status = 'skipped'
    item.error = undefined
  }

  /** Runs one resource and records a failure before the caller handles the rejection. */
  async function run(id: string, load: () => Promise<unknown> | unknown) {
    const currentGeneration = generation
    start(id)
    try {
      await load()
      if (currentGeneration !== generation)
        throw new Error('Startup resources were reset during loading')
      complete(id)
    }
    catch (error) {
      if (currentGeneration === generation)
        fail(id, error)
      throw error
    }
  }

  return { resources, progress, failed, ready, register, reset, start, complete, fail, skip, run }
})
