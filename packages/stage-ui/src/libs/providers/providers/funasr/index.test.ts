import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createFunASRModelUpdateQueue, FUNASR_TRANSCRIPTION_MODELS, providerFunASRAudioTranscription } from './index'

const t = (key: string) => key

function expectTranscriptionProvider(
  provider: unknown,
): asserts provider is TranscriptionProviderWithExtraOptions<string, { language?: string, prompt?: string }> {
  if (typeof provider !== 'object' || provider === null || !('transcription' in provider) || typeof provider.transcription !== 'function')
    throw new TypeError('Expected a transcription provider')
}

describe('providerFunASRAudioTranscription', () => {
  it('registers credential-optional local defaults and the fixed model catalog', async () => {
    const schema = providerFunASRAudioTranscription.createProviderConfig({ t })
    const config = z.parse(schema, {})
    const provider = providerFunASRAudioTranscription.createProvider(config)

    expect(providerFunASRAudioTranscription).toMatchObject({
      id: 'funasr-audio-transcription',
      requiresCredentials: false,
      tasks: expect.arrayContaining(['speech-to-text', 'asr', 'stt']),
    })
    expect(config).toMatchObject({
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    expect(FUNASR_TRANSCRIPTION_MODELS.map(model => model.id)).toEqual([
      'sensevoice',
      'fun-asr-nano',
      'paraformer',
    ])
    await expect(providerFunASRAudioTranscription.extraMethods?.listModels?.(config, provider)).resolves.toEqual(FUNASR_TRANSCRIPTION_MODELS)
  })

  it('accepts local HTTP endpoints without credentials and rejects invalid settings', async () => {
    const createValidator = providerFunASRAudioTranscription.validators?.validateConfig?.[0]
    const validator = createValidator?.({ t })
    expect(validator).toBeDefined()

    await expect(validator?.validator({
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8000/v1/',
      model: 'sensevoice',
    }, { t })).resolves.toMatchObject({ valid: true })
    await expect(validator?.validator({
      apiKey: '',
      baseUrl: 'localhost:8000/v1/',
      model: '',
    }, { t })).resolves.toMatchObject({ valid: false })
  })

  it('runs configuration validation for explicitly cleared settings', () => {
    expect(providerFunASRAudioTranscription.validationRequiredWhen?.({
      apiKey: '',
      baseUrl: '',
      model: 'sensevoice',
    })).toBe(true)
  })

  it('normalizes the base URL and preserves transcription options', () => {
    const provider = providerFunASRAudioTranscription.createProvider({
      apiKey: 'gateway-secret',
      baseUrl: 'http://localhost:8000/v1',
      model: 'sensevoice',
    })

    expectTranscriptionProvider(provider)
    expect(provider.transcription('sensevoice', { language: 'zh', prompt: 'AIRI' })).toMatchObject({
      apiKey: 'gateway-secret',
      baseURL: 'http://localhost:8000/v1/',
      language: 'zh',
      model: 'sensevoice',
      prompt: 'AIRI',
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3756986599
  it('rejects an explicitly cleared base URL (GitHub #2122)', () => {
    expect(() => providerFunASRAudioTranscription.createProvider({
      apiKey: 'not-needed',
      baseUrl: '',
      model: 'sensevoice',
    })).toThrow('FunASR Base URL is required')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842674734
  it('waits for the latest model update before a playground request (GitHub #2122)', async () => {
    let persistedModel = 'sensevoice'
    let resolveUpdate!: () => void
    const updateGate = new Promise<void>((resolve) => {
      resolveUpdate = resolve
    })
    const queue = createFunASRModelUpdateQueue(async (model) => {
      await updateGate
      persistedModel = model
    }, () => {})
    const updateTask = queue.update('paraformer')
    let requestStarted = false
    const requestTask = queue.runAfterLatest(async () => {
      requestStarted = true
      return persistedModel
    })

    // ROOT CAUSE: The computed setter discarded the synchronized store action promise, so an
    // Electron follower could read the replicated config before the leader finished the write.
    await Promise.resolve()
    expect(requestStarted).toBe(false)

    resolveUpdate()
    await updateTask
    await expect(requestTask).resolves.toBe('paraformer')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3842674734
  it('does not send a playground request after a failed model update (GitHub #2122)', async () => {
    const updateError = new Error('model update failed')
    const updateModel = vi.fn()
      .mockRejectedValueOnce(updateError)
      .mockResolvedValueOnce(undefined)
    const reportError = vi.fn()
    const queue = createFunASRModelUpdateQueue(updateModel, reportError)
    const request = vi.fn().mockResolvedValue('transcript')

    await expect(queue.update('broken')).rejects.toBe(updateError)
    await expect(queue.runAfterLatest(request)).rejects.toBe(updateError)

    // ROOT CAUSE: Swallowing the failed synchronized write at the request boundary would let
    // the playground submit with the stale replicated model.
    expect(reportError).toHaveBeenCalledWith(updateError)
    expect(request).not.toHaveBeenCalled()

    await expect(queue.update('paraformer')).resolves.toBeUndefined()
    await expect(queue.runAfterLatest(request)).resolves.toBe('transcript')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
