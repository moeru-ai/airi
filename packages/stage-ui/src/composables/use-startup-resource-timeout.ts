import { watch } from 'vue'

import { useStartupResourcesStore } from '../stores/startup-resources'

/** Fails a startup resource if it stays loading past its deadline. */
export function useStartupResourceTimeout(id: string, timeoutMs: number, message: () => string) {
  const startup = useStartupResourcesStore()

  watch(() => startup.resources.find(resource => resource.id === id)?.status, (status, _, onCleanup) => {
    if (status !== 'loading')
      return

    const timer = setTimeout(() => {
      if (startup.resources.find(resource => resource.id === id)?.status === 'loading')
        startup.fail(id, new Error(message()))
    }, timeoutMs)

    onCleanup(() => clearTimeout(timer))
  })
}
