export interface ProviderTransitionDependencies {
  applyProviderState: (provider: string) => void
  clearSegments: () => void
  getActiveProvider: () => string | undefined
  getMonitoring: () => boolean
  loadModels: (provider: string) => Promise<void>
  setMonitoring: (monitoring: boolean) => void
  shouldLoadModels: (provider: string) => boolean
  startMonitoring: () => Promise<boolean>
  stopMonitoring: (provider?: string) => Promise<void>
}

export function createProviderTransitionController(dependencies: ProviderTransitionDependencies) {
  let revision = 0
  let transitionTask: Promise<void> | undefined
  let restartMonitoring = false
  let needsMonitoringStop = false
  let providerToDispose: string | undefined

  async function reconcileLatestTransition() {
    while (true) {
      const transitionRevision = revision
      const provider = dependencies.getActiveProvider()

      if (needsMonitoringStop) {
        const disposeProvider = providerToDispose
        needsMonitoringStop = false
        providerToDispose = undefined
        await dependencies.stopMonitoring(disposeProvider)
        if (transitionRevision !== revision)
          continue
      }

      dependencies.clearSegments()

      if (!provider) {
        restartMonitoring = false
        return
      }

      if (dependencies.shouldLoadModels(provider)) {
        await dependencies.loadModels(provider)
        if (transitionRevision !== revision)
          continue
      }

      dependencies.applyProviderState(provider)
      if (transitionRevision !== revision)
        continue

      if (restartMonitoring) {
        const monitoringStarted = await dependencies.startMonitoring()
        if (transitionRevision !== revision) {
          if (monitoringStarted) {
            needsMonitoringStop = true
            providerToDispose = provider
          }
          continue
        }

        dependencies.setMonitoring(monitoringStarted)
        restartMonitoring = false
      }

      return
    }
  }

  function requestTransition(previousProvider?: string) {
    revision++
    if (dependencies.getMonitoring()) {
      restartMonitoring = true
      needsMonitoringStop = true
      providerToDispose = previousProvider
      dependencies.setMonitoring(false)
    }

    if (!transitionTask) {
      transitionTask = reconcileLatestTransition()
        .finally(() => {
          transitionTask = undefined
        })
    }

    return transitionTask
  }

  return { requestTransition }
}
