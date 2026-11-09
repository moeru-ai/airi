import { errorReportingDataCollection, selectErrorReportingIntegrations } from '@proj-airi/stage-shared/analytics/error-reporting'
import { createErrorReportingConsentFilter } from '@proj-airi/stage-ui/libs/error-reporting'
import { useSettingsAnalytics } from '@proj-airi/stage-ui/stores/settings/analytics'
import { captureException, close, createTransport, getClient, init } from '@sentry/vue'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from 'vue'

afterEach(async () => {
  await close()
  localStorage.clear()
})

describe('error report options', () => {
  it('follow the analytics switch, send no sessions, and drop URL query values and log lines', async () => {
    const envelopes: string[] = []
    const pinia = createPinia()
    const originalUrl = window.location.href
    history.replaceState(null, '', `${window.location.pathname}?code=private-oauth-code`)

    init({
      app: createApp({}),
      dsn: 'https://public@example.com/1',
      attachProps: false,
      dataCollection: errorReportingDataCollection,
      integrations: defaults => selectErrorReportingIntegrations(defaults, []),
      sendClientReports: false,
      beforeSend: createErrorReportingConsentFilter(pinia),
      transport: options => createTransport(options, async (request) => {
        envelopes.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body))
        return { statusCode: 200 }
      }),
    })

    console.warn('private chat text')
    captureException(new Error('report while on'))
    await getClient()?.flush(2000)

    useSettingsAnalytics(pinia).analyticsEnabled = false
    captureException(new Error('report while off'))
    await getClient()?.flush(2000)
    history.replaceState(null, '', originalUrl)

    const sent = envelopes.join('\n')
    expect(sent).toContain('report while on')
    expect(sent).not.toContain('report while off')
    expect(sent).not.toContain('private-oauth-code')
    expect(sent).not.toContain('private chat text')
    expect(sent).not.toContain('"type":"session"')
    expect(sent).not.toContain('"type":"client_report"')
  })
})
