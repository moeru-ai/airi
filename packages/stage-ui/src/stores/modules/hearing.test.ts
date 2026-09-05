import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProviderConfigStore } from '../providers/config'
import {
  describeEmptyTranscriptionResponse,
  filterTranscriptionByConfidence,
  normalizeGeneratedTranscriptionText,
  resolveActiveTranscriptionModel,
  resolveActiveTranscriptionProviderError,
  resolveRefreshedTranscriptionModel,
  resolveStreamTranscriptionExecutor,
  resolveTranscriptionFileName,
  resolveTranscriptionProviderOptions,
  useHearingStore,
} from './hearing'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('filterTranscriptionByConfidence', () => {
  const segments = [
    { text: 'Hello ', avg_logprob: -0.3 },
    { text: 'world ', avg_logprob: -1.2 },
    { text: 'gibberish', avg_logprob: -2.5 },
  ]

  it('keeps all segments when threshold is very low', () => {
    expect(filterTranscriptionByConfidence(segments, -3)).toBe('Hello world gibberish')
  })

  it('filters out low-confidence segments', () => {
    expect(filterTranscriptionByConfidence(segments, -1)).toBe('Hello')
  })

  it('filters out all segments when threshold is 0', () => {
    expect(filterTranscriptionByConfidence(segments, 0)).toBe('')
  })

  it('returns empty string for empty segments', () => {
    expect(filterTranscriptionByConfidence([], -1)).toBe('')
  })

  it('trims whitespace from result', () => {
    expect(filterTranscriptionByConfidence([{ text: '  hello  ', avg_logprob: -0.5 }], -1)).toBe('hello')
  })
})

describe('resolveStreamTranscriptionExecutor', () => {
  /**
   * @example
   * resolveStreamTranscriptionExecutor('official-provider-transcription')
   */
  it('routes the official transcription provider through the Aliyun streaming executor', () => {
    const executor = resolveStreamTranscriptionExecutor('official-provider-transcription')

    expect(executor).toBe(resolveStreamTranscriptionExecutor('aliyun-nls-transcription'))
  })
})

describe('resolveActiveTranscriptionProviderError', () => {
  /**
   * @example
   * resolveActiveTranscriptionProviderError('')
   */
  it('returns a clear setup error when no transcription provider is selected', () => {
    expect(resolveActiveTranscriptionProviderError('')).toBe('No active transcription provider selected. Select a provider in Settings > Hearing.')
  })

  /**
   * @example
   * resolveActiveTranscriptionProviderError('openai-compatible-audio-transcription')
   */
  it('allows a selected transcription provider', () => {
    expect(resolveActiveTranscriptionProviderError('openai-compatible-audio-transcription')).toBeUndefined()
  })
})

describe('resolveActiveTranscriptionModel', () => {
  /**
   * @example
   * resolveActiveTranscriptionModel('', { model: 'FunAudioLLM/SenseVoiceSmall' })
   */
  it('uses the provider config model when the hearing model has not been synced', () => {
    expect(resolveActiveTranscriptionModel('', { model: 'FunAudioLLM/SenseVoiceSmall' })).toBe('FunAudioLLM/SenseVoiceSmall')
  })

  /**
   * @example
   * resolveActiveTranscriptionModel('whisper-1', { model: 'FunAudioLLM/SenseVoiceSmall' })
   */
  it('prefers the explicit hearing model over the provider config model', () => {
    expect(resolveActiveTranscriptionModel('whisper-1', { model: 'FunAudioLLM/SenseVoiceSmall' })).toBe('whisper-1')
  })
})

describe('resolveRefreshedTranscriptionModel', () => {
  it('replaces a model that is unavailable at the newly configured endpoint', () => {
    expect(resolveRefreshedTranscriptionModel('model-a', [
      { id: 'model-b' },
    ])).toBe('model-b')
  })

  it('keeps the active model when the refreshed catalog still contains it', () => {
    expect(resolveRefreshedTranscriptionModel('model-b', [
      { id: 'model-a' },
      { id: 'model-b' },
    ])).toBe('model-b')
  })

  it('keeps the active model when refreshing returns no models', () => {
    expect(resolveRefreshedTranscriptionModel('model-a', [])).toBe('model-a')
  })
})

describe('refreshActiveTranscriptionModelForProvider', () => {
  it('refreshes a changed FunASR endpoint and replaces its stale active model', async () => {
    const providerId = 'funasr-instance'
    const configStore = useProviderConfigStore()
    configStore.ensureProvider(providerId, 'funasr-audio-transcription', {
      baseUrl: 'http://new.example/v1/',
    })

    const hearingStore = useHearingStore()
    hearingStore.activeTranscriptionProvider = providerId
    hearingStore.activeTranscriptionModel = 'model-a'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'model-b' }],
      object: 'list',
    }), { headers: { 'Content-Type': 'application/json' }, status: 200 })))

    await expect(hearingStore.refreshActiveTranscriptionModelForProvider(providerId)).resolves.toBe(true)
    expect(hearingStore.activeTranscriptionModel).toBe('model-b')
  })
})

describe('resolveTranscriptionProviderOptions', () => {
  /**
   * @example
   * resolveTranscriptionProviderOptions({}, 'zh-Hans')
   */
  it('derives a two-letter transcription language from the active UI locale', () => {
    expect(resolveTranscriptionProviderOptions({}, 'zh-Hans')).toEqual({ language: 'zh' })
  })

  /**
   * @example
   * resolveTranscriptionProviderOptions({ language: 'ja' }, 'zh-Hans')
   */
  it('prefers the provider language when one is configured explicitly', () => {
    expect(resolveTranscriptionProviderOptions({ language: 'ja' }, 'zh-Hans')).toEqual({ language: 'ja' })
  })
})

describe('normalizeGeneratedTranscriptionText', () => {
  /**
   * @example
   * normalizeGeneratedTranscriptionText({ result: { text: '你好' } })
   */
  it('reads nested text from OpenAI-compatible provider variants', () => {
    expect(normalizeGeneratedTranscriptionText({ result: { text: '你好' } })).toBe('你好')
  })

  /**
   * @example
   * normalizeGeneratedTranscriptionText({ segments: [{ text: '你' }, { text: '好' }] })
   */
  it('joins segment text when no top-level text is returned', () => {
    expect(normalizeGeneratedTranscriptionText({ segments: [{ text: '你' }, { text: '好' }] })).toBe('你好')
  })

  /**
   * @example
   * normalizeGeneratedTranscriptionText({ segments: [{ text: ' Hello' }, { text: ' world' }] })
   */
  it('preserves segment whitespace before trimming the final fallback text', () => {
    expect(normalizeGeneratedTranscriptionText({ segments: [{ text: ' Hello' }, { text: ' world' }] })).toBe('Hello world')
  })

  /**
   * @example
   * normalizeGeneratedTranscriptionText({ data: { text: '你好' } })
   */
  it('reads data text from provider envelope responses', () => {
    expect(normalizeGeneratedTranscriptionText({ data: { text: '你好' } })).toBe('你好')
  })
})

describe('describeEmptyTranscriptionResponse', () => {
  /**
   * @example
   * describeEmptyTranscriptionResponse({ result: { duration: 1 } })
   */
  it('describes response keys when no usable text was returned', () => {
    expect(describeEmptyTranscriptionResponse({ result: { duration: 1 } })).toContain('keys=result')
  })
})

describe('resolveTranscriptionFileName', () => {
  /**
   * @example
   * resolveTranscriptionFileName(new File([], 'recording.wav'))
   */
  it('uses the File name so OpenAI-compatible providers can infer the audio format', () => {
    expect(resolveTranscriptionFileName(new File([], 'recording.wav'))).toBe('recording.wav')
  })
})
