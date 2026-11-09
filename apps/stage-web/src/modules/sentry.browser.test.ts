import { sharedSentryOptions } from '@proj-airi/stage-shared/analytics/sentry'
import { addBreadcrumb, captureException, close, createTransport, getClient, init } from '@sentry/browser'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(async () => {
  await close()
})

describe('shared Sentry options', () => {
  it('follow the switch, send no sessions, and drop URL query values and log lines', async () => {
    const envelopes: string[] = []
    let consent = true
    const originalUrl = window.location.href
    history.replaceState(null, '', `${window.location.pathname}?code=private-oauth-code`)

    init({
      ...sharedSentryOptions,
      dsn: 'https://public@example.com/1',
      beforeSend: event => consent ? event : null,
      transport: options => createTransport(options, async (request) => {
        envelopes.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body))
        return { statusCode: 200 }
      }),
    })

    console.warn('private chat text')
    addBreadcrumb({ category: 'console', message: 'private log line' })
    captureException(new Error('report while on'))
    await getClient()?.flush(2000)

    consent = false
    captureException(new Error('report while off'))
    await getClient()?.flush(2000)
    history.replaceState(null, '', originalUrl)

    const sent = envelopes.join('\n')
    expect(sent).toContain('report while on')
    expect(sent).not.toContain('report while off')
    expect(sent).not.toContain('private-oauth-code')
    expect(sent).not.toContain('private chat text')
    expect(sent).not.toContain('private log line')
    expect(sent).not.toContain('"type":"session"')
    expect(sent).not.toContain('"type":"client_report"')
  })
})
