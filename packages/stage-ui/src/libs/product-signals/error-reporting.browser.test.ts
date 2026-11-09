import type { ErrorReportingAdapter, ErrorReportingAdapterOptions } from './error-reporting'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { setErrorReportingEnabled, setErrorReportingUser, startErrorReporting } from './error-reporting'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('error reporting', () => {
  it('queues Vue errors and lifecycle values until the adapter loads, then applies them', async () => {
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let consent = true
    let resolveAdapter!: (adapter: ErrorReportingAdapter) => void
    let options!: ErrorReportingAdapterOptions
    const adapter = { captureException: vi.fn(), setUser: vi.fn(), setEnabled: vi.fn() }
    const app = createApp({})

    startErrorReporting(app, () => consent, (loaderOptions) => {
      options = loaderOptions
      return new Promise(resolve => resolveAdapter = resolve)
    })
    const boom = new Error('boom')
    app.config.errorHandler?.(boom, null, 'setup function')
    setErrorReportingUser('user-1')
    setErrorReportingEnabled(true)

    resolveAdapter(adapter)
    await vi.waitFor(() => expect(adapter.captureException).toHaveBeenCalled())
    expect(adapter.captureException).toHaveBeenCalledWith(boom, { contexts: { vue: { componentName: undefined, lifecycleHook: 'setup function' } } })
    expect(adapter.setUser).toHaveBeenCalledWith({ id: 'user-1' })
    expect(adapter.setEnabled).toHaveBeenCalledWith(true)
    expect(console.error).toHaveBeenCalledWith(boom)

    const event = { message: 'report' }
    expect(options.beforeSend(event)).toBe(event)
    consent = false
    expect(options.beforeSend(event)).toBeNull()

    setErrorReportingUser(null)
    expect(adapter.setUser).toHaveBeenLastCalledWith(null)
  })
})
