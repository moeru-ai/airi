export interface ProviderModelSelectionControllerDependencies {
  getActiveProvider: () => string
  onSelectionError: (cause: unknown) => void
  setProvider: (providerId: string) => Promise<void>
}

export type SetModelForProvider = (providerId: string, model: string) => Promise<void>

/**
 * Starts provider changes immediately and serializes provider-bound model writes.
 */
export function createProviderModelSelectionController(
  dependencies: ProviderModelSelectionControllerDependencies,
) {
  let modelSelectionTask = Promise.resolve()
  let providerSelectionTask = Promise.resolve()
  let providerSelectionId = ''

  function selectProvider(providerId: string) {
    providerSelectionId = providerId
    const nextTask = dependencies.setProvider(providerId)
    providerSelectionTask = nextTask.catch(dependencies.onSelectionError)
    return nextTask
  }

  function selectModel(model: string, setModelForProvider: SetModelForProvider) {
    const providerId = dependencies.getActiveProvider()
    const nextTask = modelSelectionTask.then(() => setModelForProvider(providerId, model))
    modelSelectionTask = nextTask.catch(dependencies.onSelectionError)
    return nextTask
  }

  return {
    selectModel,
    selectProvider,
    waitForProviderReady: (providerId: string) => {
      return providerId === providerSelectionId ? providerSelectionTask : Promise.resolve()
    },
  }
}
