import type { ScreenpipeOcrItem } from './screenpipe'

import { describe, expect, it, vi } from 'vitest'

import { aggregateAppSummaries, createScreenpipeClient } from './screenpipe'

function ocrItem(overrides: Partial<ScreenpipeOcrItem>): ScreenpipeOcrItem {
  return {
    appName: 'Code',
    windowName: 'main.ts — airi',
    text: 'export function main() {}',
    timestamp: '2026-06-11T10:00:00.000Z',
    ...overrides,
  }
}

describe('screenpipe client', () => {
  it('parses /search responses into reduced OCR items and always scopes the query to one app', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { type: 'OCR', content: { app_name: 'Code', window_name: 'main.ts', text: 'hello', timestamp: '2026-06-11T10:00:01.000Z', focused: true } },
        { type: 'OCR', content: { app_name: '', text: 'dropped: no app name', timestamp: '2026-06-11T10:00:02.000Z' } },
        { type: 'OCR', content: { app_name: 'Code', text: 'dropped: no timestamp' } },
      ],
    })))

    const client = createScreenpipeClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const items = await client.searchOcr({ appName: 'Code', startTime: '2026-06-11T09:59:00.000Z', endTime: '2026-06-11T10:00:30.000Z' })

    expect(items).toHaveLength(1)
    expect(items[0]!.appName).toBe('Code')
    expect(items[0]!.windowName).toBe('main.ts')

    // The capture boundary at the transport level: every OCR text query
    // carries app_name (SearchOcrParams.appName is required, so an unscoped
    // text query is not even expressible).
    const requestedUrl = String(fetchImpl.mock.calls[0]![0])
    expect(requestedUrl).toContain('/search?')
    expect(requestedUrl).toContain('content_type=ocr')
    expect(requestedUrl).toContain('app_name=Code')
  })

  it('materializes only window metadata from the focused-window probe, never OCR text', async () => {
    const leakedText = 'TOP SECRET non-whitelisted document body'
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { type: 'OCR', content: { app_name: 'Slack', window_name: 'general', text: leakedText, timestamp: '2026-06-11T10:00:01.000Z', focused: true } },
      ],
    })))

    const client = createScreenpipeClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const focused = await client.focusedWindow()

    expect(focused).toBeDefined()
    expect(focused!.appName).toBe('Slack')
    expect(focused!.windowTitle).toBe('general')
    // The probe result is the ONLY object kept from this response: it must
    // carry no text field and no trace of the OCR body.
    expect(Object.keys(focused!).sort()).toEqual(['appName', 'windowTitle'])
    expect(JSON.stringify(focused)).not.toContain(leakedText)
  })

  it('degrades to unhealthy and empty results when screenpipe is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const client = createScreenpipeClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(await client.health()).toBe(false)
    expect(await client.searchOcr({ appName: 'Code', startTime: 'a', endTime: 'b' })).toEqual([])
    expect(await client.focusedWindow()).toBeUndefined()
  })
})

describe('aggregateAppSummaries', () => {
  it('groups items per app with the dominant window title and a capped digest', () => {
    const longText = 'x'.repeat(500)
    const items = [
      ocrItem({ timestamp: '2026-06-11T10:00:00.000Z', windowName: 'a.ts' }),
      ocrItem({ timestamp: '2026-06-11T10:00:01.000Z', windowName: 'b.ts' }),
      ocrItem({ timestamp: '2026-06-11T10:00:02.000Z', windowName: 'b.ts', text: longText }),
      // Duplicate timestamp must not inflate the observed-seconds estimate.
      ocrItem({ timestamp: '2026-06-11T10:00:02.000Z', windowName: 'b.ts' }),
    ]

    const summaries = aggregateAppSummaries(items, ['Code'])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.appId).toBe('code')
    expect(summaries[0]!.appName).toBe('Code')
    expect(summaries[0]!.windowTitle).toBe('b.ts')
    expect(summaries[0]!.observedSeconds).toBe(3)
    expect(summaries[0]!.matchedWhitelist).toBe(true)
    expect(summaries[0]!.summary.length).toBeLessThan(longText.length)
  })

  // ROOT CAUSE:
  //
  // QA found the previous behavior emitted non-whitelisted apps with
  // matchedWhitelist=false, including their window title and an OCR text
  // digest in `summary` — leaking non-whitelisted content past the capture
  // boundary, and the old test fixated exactly that.
  //
  // We fixed this by discarding non-whitelisted items before aggregation:
  // nothing outside the whitelist is emitted at all, in any field.
  it('drops non-whitelisted apps entirely instead of emitting them flagged', () => {
    const leakedText = 'private DM from a non-whitelisted app'
    const summaries = aggregateAppSummaries([
      ocrItem({ appName: 'code' }),
      ocrItem({ appName: 'Slack', windowName: 'general', text: leakedText }),
    ], ['Code'])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.appName).toBe('code')
    expect(summaries[0]!.matchedWhitelist).toBe(true)
    expect(JSON.stringify(summaries)).not.toContain('Slack')
    expect(JSON.stringify(summaries)).not.toContain('general')
    expect(JSON.stringify(summaries)).not.toContain(leakedText)
  })

  it('matches the whitelist case-insensitively', () => {
    const summaries = aggregateAppSummaries([ocrItem({ appName: 'code' })], ['Code'])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.appId).toBe('code')
    expect(summaries[0]!.matchedWhitelist).toBe(true)
  })

  it('returns an empty list for no observations', () => {
    expect(aggregateAppSummaries([], ['Code'])).toEqual([])
  })
})
