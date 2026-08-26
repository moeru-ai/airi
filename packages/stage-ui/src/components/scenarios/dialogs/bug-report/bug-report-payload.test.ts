import { describe, expect, it } from 'vitest'

import { buildBugReportPayload, createBugReportPageContext } from './bug-report-payload'

describe('bug report payload helpers', () => {
  it('builds markdown payload with description and optional context/screenshot flags', () => {
    const payload = buildBugReportPayload({
      description: 'Clicking send does nothing',
      includeTriageContext: true,
      context: {
        url: 'https://airi.local/chat?room=debug',
        title: 'AIRI Chat',
        userAgent: 'test-agent',
        viewport: '1440x900',
        language: 'en-US',
        timeZone: 'Asia/Shanghai',
        timestamp: '2026-04-09T11:22:33.000Z',
      },
      screenshotAttached: true,
    })

    expect(payload).toContain('## Bug Report')
    expect(payload).toContain('Clicking send does nothing')
    expect(payload).toContain('## Triage Context')
    expect(payload).toContain('- URL: https://airi.local/chat?room=debug')
    expect(payload).toContain('- Screenshot attached: yes')
  })

  it('returns null page context when window is unavailable', () => {
    const context = createBugReportPageContext(undefined)
    expect(context).toBeNull()
  })

  it('extracts page context from a window-like object', () => {
    const context = createBugReportPageContext({
      location: {
        href: 'https://airi.local/settings?tab=providers',
      },
      document: {
        title: 'Settings',
      },
      navigator: {
        userAgent: 'unit-test',
        language: 'en-US',
      },
      innerWidth: 1280,
      innerHeight: 720,
      Intl: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'UTC' }),
        }),
      },
      Date: {
        now: () => 1_700_000_000_000,
      },
    })

    expect(context).toEqual({
      url: 'https://airi.local/settings?tab=providers',
      title: 'Settings',
      userAgent: 'unit-test',
      viewport: '1280x720',
      language: 'en-US',
      timeZone: 'UTC',
      timestamp: '2023-11-14T22:13:20.000Z',
    })
  })
})
