import { describe, expect, it } from 'vitest'
import { buildStreamingTtsUrl } from './tts-analytics'

describe('buildStreamingTtsUrl', () => {
  const httpBase = 'http://localhost:8080'
  const httpsBase = 'https://localhost:8080'
  const path = '/api/tts/stream'
  const token = 'test-token-123'
  const defaultAnalytics = { ttsTrigger: 'auto' as const, ttsSource: 'chat_auto_tts' as const }

  it('switches http:// base to ws:// protocol', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, defaultAnalytics)
    const parsed = new URL(result)
    expect(parsed.protocol).toBe('ws:')
  })

  it('switches https:// base to wss:// protocol', () => {
    const result = buildStreamingTtsUrl(httpsBase, path, token, defaultAnalytics)
    const parsed = new URL(result)
    expect(parsed.protocol).toBe('wss:')
  })

  it('includes token, tts_trigger, and tts_source as query params', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, defaultAnalytics)
    const parsed = new URL(result)
    expect(parsed.searchParams.get('token')).toBe(token)
    expect(parsed.searchParams.get('tts_trigger')).toBe('auto')
    expect(parsed.searchParams.get('tts_source')).toBe('chat_auto_tts')
  })

  it('preserves the path argument in the URL pathname', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, defaultAnalytics)
    const parsed = new URL(result)
    expect(parsed.pathname).toBe(path)
  })

  it('supports TtsTrigger value "auto"', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, { ttsTrigger: 'auto', ttsSource: 'chat_auto_tts' })
    const parsed = new URL(result)
    expect(parsed.searchParams.get('tts_trigger')).toBe('auto')
  })

  it('supports TtsTrigger value "manual"', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, { ttsTrigger: 'manual', ttsSource: 'chat_auto_tts' })
    const parsed = new URL(result)
    expect(parsed.searchParams.get('tts_trigger')).toBe('manual')
  })

  it('supports TtsSource value "chat_auto_tts"', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, { ttsTrigger: 'auto', ttsSource: 'chat_auto_tts' })
    const parsed = new URL(result)
    expect(parsed.searchParams.get('tts_source')).toBe('chat_auto_tts')
  })

  it('supports TtsSource value "manual_preview"', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, { ttsTrigger: 'auto', ttsSource: 'manual_preview' })
    const parsed = new URL(result)
    expect(parsed.searchParams.get('tts_source')).toBe('manual_preview')
  })

  it('supports TtsSource value "settings_test"', () => {
    const result = buildStreamingTtsUrl(httpBase, path, token, { ttsTrigger: 'auto', ttsSource: 'settings_test' })
    const parsed = new URL(result)
    expect(parsed.searchParams.get('tts_source')).toBe('settings_test')
  })
})
