import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import { isEnvTruthy } from '@proj-airi/stage-shared'

export interface AnalyticsIdentitySnapshot {
  /** Current provider distinct id for the browser, device, or user. */
  distinctId: string
  /** Current provider session id, when one exists. */
  sessionId?: string
}

/** Provider-neutral delivery options for one product event. */
export interface AnalyticsCaptureOptions {
  /** Selects an unload-safe delivery method before document navigation. */
  beforeNavigation?: boolean
}

/** Provider contract behind the product analytics facade. */
export interface AnalyticsAdapter {
  capture: (name: string, properties: object, options?: AnalyticsCaptureOptions) => boolean
  getIdentitySnapshot: () => AnalyticsIdentitySnapshot | null
  identify: (userId: string) => void
  registerBuildInfo: (buildInfo: AboutBuildInfo) => void
  resetIdentity: () => void
  setCaptureEnabled: (enabled: boolean) => boolean
}

/** Initial state given to an asynchronously loaded analytics provider. */
export interface AnalyticsAdapterOptions {
  enabled: boolean
}

/** Loads one analytics provider adapter. */
export type AnalyticsAdapterLoader = (options: AnalyticsAdapterOptions) => Promise<AnalyticsAdapter>

type PendingOperation
  = | { kind: 'capture', name: string, properties: object, options?: AnalyticsCaptureOptions }
    | { kind: 'identify', userId: string }
    | { kind: 'register-build-info', buildInfo: AboutBuildInfo }
    | { kind: 'reset-identity' }
    | { kind: 'set-capture-enabled', enabled: boolean }

type LoadState = 'idle' | 'loading' | 'ready' | 'unavailable'

/**
 * Owns an optional provider lifecycle and keeps provider loading outside the
 * static application graph. Calls made while loading use a bounded queue.
 */
export class AnalyticsClient {
  private adapter: AnalyticsAdapter | undefined
  private captureEnabled = false
  private loadPromise: Promise<boolean> | undefined
  private loadState: LoadState = 'idle'
  private readonly pendingOperations: PendingOperation[] = []

  constructor(private readonly loader: AnalyticsAdapterLoader) {}

  ensureInitialized(enabled: boolean): boolean {
    this.captureEnabled = enabled
    if (!enabled || this.loadState === 'unavailable')
      return false

    if (this.loadState === 'idle')
      void this.load(enabled)

    return true
  }

  syncCapture(enabled: boolean): boolean {
    this.captureEnabled = enabled
    if (enabled)
      return this.ensureInitialized(true)

    if (this.adapter)
      this.adapter.setCaptureEnabled(false)
    else if (this.loadState === 'loading')
      this.enqueue({ kind: 'set-capture-enabled', enabled: false })

    return false
  }

  registerBuildInfo(buildInfo: AboutBuildInfo): void {
    if (this.adapter)
      this.adapter.registerBuildInfo(buildInfo)
    else if (this.loadState === 'loading')
      this.enqueue({ kind: 'register-build-info', buildInfo })
  }

  identify(userId: string): void {
    if (this.adapter)
      this.adapter.identify(userId)
    else if (this.loadState === 'loading')
      this.enqueue({ kind: 'identify', userId })
  }

  resetIdentity(): void {
    if (this.adapter)
      this.adapter.resetIdentity()
    else if (this.loadState === 'loading')
      this.enqueue({ kind: 'reset-identity' })
  }

  getIdentitySnapshot(): AnalyticsIdentitySnapshot | null {
    return this.adapter?.getIdentitySnapshot() ?? null
  }

  capture(name: string, properties: object, options?: AnalyticsCaptureOptions): boolean {
    if (!this.captureEnabled)
      return false

    if (this.adapter)
      return this.adapter.capture(name, properties, options)

    if (this.loadState === 'loading') {
      this.enqueue({ kind: 'capture', name, properties, options })
      return true
    }

    return false
  }

  private load(enabled: boolean): Promise<boolean> {
    if (this.loadPromise)
      return this.loadPromise

    this.loadState = 'loading'
    this.loadPromise = Promise.resolve()
      .then(() => this.loader({ enabled }))
      .then((adapter) => {
        this.adapter = adapter
        this.loadState = 'ready'
        this.flush()
        return true
      })
      .catch(() => {
        this.pendingOperations.length = 0
        this.loadState = 'unavailable'
        return false
      })

    return this.loadPromise
  }

  private enqueue(operation: PendingOperation): void {
    if (this.pendingOperations.length === 100)
      this.pendingOperations.shift()
    this.pendingOperations.push(operation)
  }

  private flush(): void {
    if (!this.adapter)
      return

    for (const operation of this.pendingOperations) {
      switch (operation.kind) {
        case 'capture':
          this.adapter.capture(operation.name, operation.properties, operation.options)
          break
        case 'identify':
          this.adapter.identify(operation.userId)
          break
        case 'register-build-info':
          this.adapter.registerBuildInfo(operation.buildInfo)
          break
        case 'reset-identity':
          this.adapter.resetIdentity()
          break
        case 'set-capture-enabled':
          this.adapter.setCaptureEnabled(operation.enabled)
      }
    }
    this.pendingOperations.length = 0
  }
}

let adapterLoader: AnalyticsAdapterLoader | undefined
const analyticsClient = new AnalyticsClient(async (options) => {
  if (!adapterLoader)
    throw new Error('No analytics adapter has been configured')
  return adapterLoader(options)
})

/** Configures the provider adapter before analytics starts. */
export function configureAnalyticsAdapter(loader: AnalyticsAdapterLoader): void {
  adapterLoader = loader
}

export function isAnalyticsAvailableInBuild(): boolean {
  return isEnvTruthy(import.meta.env.VITE_ENABLE_POSTHOG)
}

export function enableAnalyticsCapture(): boolean {
  if (!isAnalyticsAvailableInBuild() || !adapterLoader)
    return false
  return analyticsClient.syncCapture(true)
}

export function disableAnalyticsCapture(): void {
  if (!isAnalyticsAvailableInBuild() || !adapterLoader)
    return
  analyticsClient.syncCapture(false)
}

export function getAnalyticsIdentitySnapshot(): AnalyticsIdentitySnapshot | null {
  return analyticsClient.getIdentitySnapshot()
}

export function identifyAnalyticsUser(userId: string): void {
  analyticsClient.identify(userId)
}

export function registerAnalyticsBuildInfo(buildInfo: AboutBuildInfo): void {
  analyticsClient.registerBuildInfo(buildInfo)
}

export function resetAnalyticsIdentity(): void {
  analyticsClient.resetIdentity()
}

export function captureAnalyticsEvent(name: string, properties: object, options?: AnalyticsCaptureOptions): boolean {
  return analyticsClient.capture(name, properties, options)
}
