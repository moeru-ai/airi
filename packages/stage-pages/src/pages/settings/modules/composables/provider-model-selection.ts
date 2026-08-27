export interface ProviderModelSelectionDependencies {
  getActiveProvider: () => string
  queue: (action: () => Promise<void>) => Promise<void>
  setModelForProvider: (providerId: string, model: string) => Promise<void>
}

export function queueProviderModelSelection(
  dependencies: ProviderModelSelectionDependencies,
  model: string,
) {
  const providerId = dependencies.getActiveProvider()
  return dependencies.queue(() => dependencies.setModelForProvider(providerId, model))
}
