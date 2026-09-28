import { computed, ref } from 'vue'

interface StartupTask<Id extends string> {
  id: Id
  requires: readonly Id[]
}

/** Tracks completed startup tasks and enforces their resource dependencies. */
export function createStartupProgress<const Id extends string>(tasks: readonly StartupTask<Id>[]) {
  const completed = new Set<Id>()
  const completedCount = ref(0)
  const progress = computed(() => Math.round(completedCount.value / tasks.length * 100))

  function isComplete(id: Id) {
    return completed.has(id)
  }

  function complete(id: Id) {
    const task = tasks.find(task => task.id === id)
    if (!task)
      throw new Error(`Unknown startup task: ${id}`)

    const missing = task.requires.find(required => !completed.has(required))
    if (missing)
      throw new Error(`Startup task ${id} requires ${missing}`)

    completed.add(id)
    completedCount.value = completed.size
  }

  return { progress, isComplete, complete }
}
