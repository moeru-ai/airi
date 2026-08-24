export interface ProviderTransitionDependencies {
  applyProviderState: (provider: string) => void
  clearSegments: () => void
  getActiveProvider: () => string | undefined
  getMonitoring: () => boolean
  setMonitoring: (monitoring: boolean) => void
  startMonitoring: () => Promise<boolean>
  stopMonitoring: (provider?: string) => Promise<void>
  waitForProviderReady: (provider: string) => Promise<void>
}

export function createProviderTransitionController(dependencies: ProviderTransitionDependencies) {
  let revision = 0
  let transitionTask: Promise<void> | undefined
  let restartMonitoring = false
  let needsMonitoringStop = false
  let providerToDispose: string | undefined
  let disposed = false

  async function reconcileLatestTransition() {
    while (true) {
      if (disposed)
        return

      const transitionRevision = revision
      const provider = dependencies.getActiveProvider()

      if (needsMonitoringStop) {
        const disposeProvider = providerToDispose
        needsMonitoringStop = false
        providerToDispose = undefined
        await dependencies.stopMonitoring(disposeProvider)
        if (disposed)
          return
        if (transitionRevision !== revision)
          continue
      }

      dependencies.clearSegments()

      if (!provider) {
        restartMonitoring = false
        return
      }

      await dependencies.waitForProviderReady(provider)
      if (disposed)
        return
      if (transitionRevision !== revision)
        continue

      dependencies.applyProviderState(provider)
      if (disposed)
        return
      if (transitionRevision !== revision)
        continue

      if (restartMonitoring) {
        const monitoringStarted = await dependencies.startMonitoring()
        if (transitionRevision !== revision) {
          if (monitoringStarted) {
            if (disposed) {
              await dependencies.stopMonitoring(provider)
            }
            else {
              needsMonitoringStop = true
              providerToDispose = provider
            }
          }
          if (disposed)
            return
          continue
        }

        dependencies.setMonitoring(monitoringStarted)
        restartMonitoring = false
      }

      return
    }
  }

  function requestTransition(previousProvider?: string) {
    if (disposed)
      return Promise.resolve()

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

  function dispose() {
    if (disposed)
      return

    disposed = true
    revision++
    restartMonitoring = false
    needsMonitoringStop = false
    providerToDispose = undefined
  }

  return { dispose, requestTransition }
}
