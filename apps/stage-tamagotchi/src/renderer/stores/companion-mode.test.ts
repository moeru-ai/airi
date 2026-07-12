import { describe, expect, it } from 'vitest'

import {
  buildCompanionModePrompt,
  COMPANION_MODE_DEFAULT_INTERVAL_MS,
  COMPANION_MODE_MAX_INTERVAL_MS,
  COMPANION_MODE_MIN_INTERVAL_MS,
  COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS,
  COMPANION_MODE_WINDOW_MINIMIZED_FALLBACK_INTENT,
  COMPANION_MODE_WINDOW_MINIMIZED_FALLBACK_PROMPT,
  companionModeDataUrlToAttachment,
  createDefaultCompanionModeRuntimeSnapshot,
  getDefaultCompanionModePromptTemplate,
  isCompanionModeRuntimeFresh,
  isCompanionModeSourceAllowedForKind,
  normalizeCompanionModeIntervalMs,
  normalizeCompanionModeSourceKind,
  resolveCompanionModeCaptureSourceId,
  resolveCompanionModeRuntimeStatus,
  resolveCompanionModeWindowFallbackSelection,
} from './companion-mode'

describe('companion mode helpers', () => {
  it('clamps interval values to the supported range', () => {
    expect(normalizeCompanionModeIntervalMs(1)).toBe(COMPANION_MODE_MIN_INTERVAL_MS)
    expect(normalizeCompanionModeIntervalMs(COMPANION_MODE_MAX_INTERVAL_MS + 1)).toBe(COMPANION_MODE_MAX_INTERVAL_MS)
    expect(normalizeCompanionModeIntervalMs('not-a-number')).toBe(COMPANION_MODE_DEFAULT_INTERVAL_MS)
  })

  it('normalizes source kind values', () => {
    expect(normalizeCompanionModeSourceKind('window')).toBe('window')
    expect(normalizeCompanionModeSourceKind('screen')).toBe('screen')
    expect(normalizeCompanionModeSourceKind('unknown')).toBe('screen')
  })

  it('allows screen sources as the safe whole-screen fallback for window observation', () => {
    expect(isCompanionModeSourceAllowedForKind('screen:1:0', 'screen')).toBe(true)
    expect(isCompanionModeSourceAllowedForKind('window:12:0', 'screen')).toBe(false)
    expect(isCompanionModeSourceAllowedForKind('screen:1:0', 'window')).toBe(true)
    expect(isCompanionModeSourceAllowedForKind('window:12:0', 'window')).toBe(true)
  })

  it('resolves companion capture sources with whole-screen fallback in window mode', () => {
    const sources = [
      { id: 'screen:1:0' },
      { id: 'window:12:0' },
    ]

    expect(resolveCompanionModeCaptureSourceId({
      sources,
      selectedSourceId: 'window:12:0',
      sourceKind: 'window',
    })).toBe('window:12:0')

    expect(resolveCompanionModeCaptureSourceId({
      sources,
      selectedSourceId: '',
      sourceKind: 'window',
    })).toBe('screen:1:0')

    expect(resolveCompanionModeCaptureSourceId({
      sources,
      selectedSourceId: 'window:12:0',
      sourceKind: 'screen',
    })).toBe('screen:1:0')
  })

  it('resolves minimized window fallback to a screen source and visible character prompt', () => {
    const sources = [
      { id: 'window:12:0' },
      { id: 'screen:1:0' },
    ]

    expect(resolveCompanionModeWindowFallbackSelection({
      sources,
      activeSourceId: 'window:12:0',
    })).toEqual({
      sourceKind: 'screen',
      sourceId: 'screen:1:0',
      promptText: COMPANION_MODE_WINDOW_MINIMIZED_FALLBACK_PROMPT,
    })
    expect(COMPANION_MODE_WINDOW_MINIMIZED_FALLBACK_PROMPT).toContain(COMPANION_MODE_WINDOW_MINIMIZED_FALLBACK_INTENT)
    expect(resolveCompanionModeWindowFallbackSelection({
      sources,
      activeSourceId: 'screen:1:0',
    })).toBeNull()
  })

  it('derives shared runtime status from heartbeat freshness', () => {
    const snapshot = {
      ...createDefaultCompanionModeRuntimeSnapshot(),
      enabled: true,
      isRunning: true,
      lastHeartbeatAt: 1_000,
      updatedAt: 1_000,
    }

    expect(isCompanionModeRuntimeFresh(snapshot, 1_000 + COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS)).toBe(true)
    expect(isCompanionModeRuntimeFresh(snapshot, 1_001 + COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS)).toBe(false)
    expect(resolveCompanionModeRuntimeStatus({
      enabled: true,
      snapshot,
      now: 1_500,
    }).kind).toBe('running')
    expect(resolveCompanionModeRuntimeStatus({
      enabled: true,
      snapshot,
      now: 1_001 + COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS,
    }).kind).toBe('unreported')
    expect(resolveCompanionModeRuntimeStatus({
      enabled: false,
      snapshot: {
        ...snapshot,
        lastError: 'still old',
      },
      now: 1_500,
    }).kind).toBe('idle')
  })

  it('converts captured frame data URLs to image attachments', () => {
    expect(companionModeDataUrlToAttachment('data:image/jpeg;base64,abc123')).toEqual({
      type: 'image',
      mimeType: 'image/jpeg',
      data: 'abc123',
    })
  })

  it('builds a casual companion prompt with source context', () => {
    const prompt = buildCompanionModePrompt({
      capturedAt: 0,
      sourceName: 'Screen 1',
    })

    expect(prompt).toContain('Companion Mode glanced at the current screen.')
    expect(prompt).toContain('Observed source: Screen 1')
    expect(prompt).toContain('relaxed, casual way')
  })

  it('applies a custom companion prompt template', () => {
    const prompt = buildCompanionModePrompt({
      capturedAt: 0,
      language: 'en-US',
      sourceName: 'Game Window',
      promptTemplate: 'Saw {sourceName} at {capturedAt}. Language: {language}.',
    })

    expect(prompt).toContain('Saw Game Window at')
    expect(prompt).toContain('Language: en-US.')
  })

  it('uses a Chinese companion prompt for Chinese locales', () => {
    const prompt = buildCompanionModePrompt({
      capturedAt: 0,
      language: 'zh-Hans',
      sourceName: '屏幕 1',
    })

    expect(prompt).toContain('陪伴模式看了一眼当前屏幕。')
    expect(prompt).toContain('观察来源：屏幕 1')
    expect(prompt).toContain('自然、轻松地回应')
  })

  it('returns localized default prompt templates', () => {
    expect(getDefaultCompanionModePromptTemplate('en')).toContain('{sourceName}')
    expect(getDefaultCompanionModePromptTemplate('zh-Hans')).toContain('观察来源：{sourceName}')
  })
})
