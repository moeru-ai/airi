import { describe, expect, it } from 'vitest'

import { buildBugReportPayload, createBugReportPageContext } from './bug-report-payload'

describe('bug report payload helpers', () => {
  it('builds markdown payload with description and optional context/screenshot flags', () => {
    const payload = buildBugReportPayload({
      context: {
        language: 'en-US',
        timestamp: '2026-04-09T11:22:33.000Z',
        timeZone: 'Asia/Shanghai',
        title: 'AIRI Chat',
        url: 'https://airi.local/chat?room=debug',
        userAgent: 'test-agent',
        viewport: '1440x900',
      },
      description: 'Clicking send does nothing',
      includeTriageContext: true,
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
      Date: {
        now: () => 1_700_000_000_000,
      },
      document: {
        title: 'Settings',
      },
      innerHeight: 720,
      innerWidth: 1280,
      Intl: {
        DateTimeFormat: () => ({
          resolvedOptions: () => ({ timeZone: 'UTC' }),
        }),
      },
      location: {
        href: 'https://airi.local/settings?tab=providers',
      },
      navigator: {
        language: 'en-US',
        userAgent: 'unit-test',
      },
    })

    expect(context).toEqual({
      language: 'en-US',
      timestamp: '2023-11-14T22:13:20.000Z',
      timeZone: 'UTC',
      title: 'Settings',
      url: 'https://airi.local/settings?tab=providers',
      userAgent: 'unit-test',
      viewport: '1280x720',
    })
  })
})
