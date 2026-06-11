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
  it('parses /search responses into reduced OCR items', async () => {
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
    expect(items[0]!.focused).toBe(true)

    const requestedUrl = String(fetchImpl.mock.calls[0]![0])
    expect(requestedUrl).toContain('/search?')
    expect(requestedUrl).toContain('content_type=ocr')
    expect(requestedUrl).toContain('app_name=Code')
  })

  it('degrades to unhealthy and empty results when screenpipe is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const client = createScreenpipeClient({ fetchImpl: fetchImpl as unknown as typeof fetch })

    expect(await client.health()).toBe(false)
    expect(await client.searchOcr({ startTime: 'a', endTime: 'b' })).toEqual([])
    expect(await client.latestFrame()).toBeUndefined()
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

  it('matches the whitelist case-insensitively and flags non-matching apps', () => {
    const summaries = aggregateAppSummaries([
      ocrItem({ appName: 'code' }),
      ocrItem({ appName: 'Slack', windowName: 'general' }),
    ], ['Code'])

    const byApp = new Map(summaries.map(summary => [summary.appName, summary]))
    expect(byApp.get('code')!.matchedWhitelist).toBe(true)
    expect(byApp.get('Slack')!.matchedWhitelist).toBe(false)
  })

  it('returns an empty list for no observations', () => {
    expect(aggregateAppSummaries([], ['Code'])).toEqual([])
  })
})
