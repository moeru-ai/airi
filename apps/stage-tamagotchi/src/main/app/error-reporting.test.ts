import type { InferOutput } from 'valibot'

import type { globalAppConfigSchema } from '../configs/global'
import type { Config } from '../libs/electron/persistence'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
}))

vi.mock('@sentry/electron/main', () => sentryMock)

describe('errorReporting', async () => {
  const { ErrorReporting } = await import('./error-reporting')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockConfig(initial?: Partial<InferOutput<typeof globalAppConfigSchema>>): Config<typeof globalAppConfigSchema> {
    let data = initial as InferOutput<typeof globalAppConfigSchema> | undefined
    return {
      get: () => data,
      update: (newData) => {
        data = newData
      },
      setup: () => ({ status: 'ok', path: '' }),
      getDiagnostics: () => undefined,
    }
  }

  it('initializes Sentry error reporting with desktop DSN', () => {
    const config = createMockConfig({ errorReportingEnabled: true })
    const errorReporting = new ErrorReporting(config)

    errorReporting.start()

    expect(sentryMock.init).toHaveBeenCalledTimes(1)
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: expect.any(String),
      }),
    )
  })

  it('drops reports when error reporting is disabled', () => {
    const config = createMockConfig({ errorReportingEnabled: false })
    const errorReporting = new ErrorReporting(config)

    errorReporting.start()

    const options = sentryMock.init.mock.calls[0][0]
    const dummyEvent = { event_id: 'test-event-1' } as const
    expect(options.beforeSend(dummyEvent)).toBeNull()
  })

  it('preserves reports when error reporting is enabled', () => {
    const config = createMockConfig({ errorReportingEnabled: true })
    const errorReporting = new ErrorReporting(config)

    errorReporting.start()

    const options = sentryMock.init.mock.calls[0][0]
    const dummyEvent = { event_id: 'test-event-2' } as const
    expect(options.beforeSend(dummyEvent)).toBe(dummyEvent)
  })

  it('updates config and toggles beforeSend behavior when setEnabled is called', () => {
    const config = createMockConfig({ errorReportingEnabled: true })
    const errorReporting = new ErrorReporting(config)

    errorReporting.start()
    const options = sentryMock.init.mock.calls[0][0]
    const dummyEvent = { event_id: 'test-event-3' } as const

    expect(options.beforeSend(dummyEvent)).toBe(dummyEvent)

    errorReporting.setEnabled(false)
    expect(config.get()?.errorReportingEnabled).toBe(false)
    expect(options.beforeSend(dummyEvent)).toBeNull()
  })
})
