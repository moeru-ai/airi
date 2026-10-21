import { describe, expect, it } from 'vitest'

import { openaiSpeechFromRunContext, openaiTranscriptionFromRunContext, speechModelFrom, speechModelFromRun, speechModelMatrix, SpeechModels, speechProviderFrom, SpeechProviders, transcriptionModelFrom, transcriptionModelFromEval, transcriptionRequestFromRunContext, voiceFor } from './speech-models'

describe('speechProviders', () => {
  it('resolves requiredEnv and optionalEnv provider parameters from config env', async () => {
    const plugin = SpeechProviders({
      providers: [speechProviderFrom({ id: 'tts', inferenceExecutor: 'openai', optionalEnv: { apiKey: 'TTS_API_KEY' }, requiredEnv: { baseURL: 'TTS_BASE_URL' } })],
    })

    const result = await plugin.configVieval?.({ env: { TTS_BASE_URL: 'http://127.0.0.1:5933/v1/' }, models: [] })

    expect(result?.speechProviders?.[0]?.parameters).toEqual({ baseURL: 'http://127.0.0.1:5933/v1/' })
  })

  it('throws when a required env value is missing', () => {
    const plugin = SpeechProviders({
      providers: [speechProviderFrom({ id: 'tts', inferenceExecutor: 'openai', requiredEnv: { baseURL: 'TTS_BASE_URL' } })],
    })

    expect(() => plugin.configVieval?.({ env: {}, models: [] })).toThrow('TTS_BASE_URL')
  })
})

describe('speechModels', () => {
  const createMatrixContext = async () => {
    const providers = SpeechProviders({
      providers: [speechProviderFrom({ id: 'local', inferenceExecutor: 'openai', parameters: { apiKey: 'provider-key', baseURL: 'http://127.0.0.1:5933/v1/' } })],
    })
    const models = SpeechModels({
      models: [
        speechModelFrom({ id: 'azure', model: 'microsoft/v1', provider: 'local', voice: 'en-US-AriaNeural', voices: { zh: 'zh-CN-XiaoxiaoNeural' } }),
        transcriptionModelFrom({ model: 'whisper-1', parameters: { apiKey: '' }, provider: 'local' }),
      ],
    })
    // A hook may return nothing to keep the config it got.
    const base = { env: {}, models: [] }
    const withProviders = await providers.configVieval!(base) ?? base
    const config = await models.configVieval!(withProviders) ?? withProviders

    return {
      cache: {} as never,
      models: config.models ?? [],
      task: {
        entry: { description: 'desc', directory: 'd', filePath: '/tmp/a.eval.ts', id: 'entry', name: 'entry' },
        id: 'task-1',
        inferenceExecutor: { id: 'default' },
        matrix: {
          eval: { asr: 'whisper-1' },
          meta: { evalRowId: 'asr=whisper-1', runRowId: 'tts=azure' },
          run: { tts: 'azure' },
        },
      },
    }
  }

  it('adds speech and transcription models to the shared model registry with their provider parameters', async () => {
    const context = await createMatrixContext()

    expect(context.models.map(model => model.id)).toEqual(['azure', 'openai:whisper-1'])
    expect(context.models[0]?.parameters).toMatchObject({ apiKey: 'provider-key', baseURL: 'http://127.0.0.1:5933/v1/', capability: 'speech' })
  })

  it('resolves models from matrix axes and turns them into runtime config', async () => {
    const context = await createMatrixContext()

    const speech = openaiSpeechFromRunContext(speechModelFromRun(context, { axis: 'tts' }))
    expect(speech.model).toBe('microsoft/v1')
    expect(voiceFor(speech, 'zh')).toBe('zh-CN-XiaoxiaoNeural')
    expect(voiceFor(speech, 'ja')).toBe('en-US-AriaNeural')

    // A model parameter wins over the provider parameter, so a local ASR server can run without a key.
    const transcription = openaiTranscriptionFromRunContext(transcriptionModelFromEval(context, { axis: 'asr' }))
    expect(transcription).toEqual({ apiKey: '', baseURL: 'http://127.0.0.1:5933/v1/', inferenceExecutor: 'openai', model: 'whisper-1' })
  })

  it('rejects a model with the wrong capability, an unknown model, and a missing axis', async () => {
    const context = await createMatrixContext()
    const swapped = { ...context, task: { ...context.task, matrix: { ...context.task.matrix, run: { tts: 'whisper-1' } } } }

    expect(() => speechModelFromRun(swapped, { axis: 'tts' })).toThrow('is not a speech model')
    expect(() => speechModelFromRun(context, { axis: 'voice' })).toThrow('Missing run matrix axis "voice".')
    expect(() => transcriptionModelFromEval({ ...context, models: [] }, { axis: 'asr' })).toThrow('Unknown configured speech model "whisper-1"')
  })

  it('registers a model without env, and fails only when a task resolves it without its base URL', async () => {
    const providers = SpeechProviders({
      providers: [speechProviderFrom({ id: 'azure', inferenceExecutor: 'openai', optionalEnv: { baseURL: 'TTS_AZURE_BASE_URL' } })],
    })
    const models = SpeechModels({ models: [speechModelFrom({ id: 'azure', model: 'microsoft/v1', provider: 'azure' })] })
    const base = { env: {}, models: [] }
    const withProviders = await providers.configVieval!(base) ?? base
    const config = await models.configVieval!(withProviders) ?? withProviders
    const azure = config.models?.[0]

    expect(azure?.id).toBe('azure')
    expect(() => openaiSpeechFromRunContext(azure!)).toThrow('Model "azure" has no "baseURL" parameter. Set it on speech provider "azure"')
  })

  it('resolves a transcription executor per call, with the language of the call and the resolved provider env', async () => {
    const calls: Array<{ language?: string, model: string, parameters: Readonly<Record<string, unknown>> }> = []
    const executorFetch = async () => new Response(JSON.stringify({ text: 'ok' }))
    const providers = SpeechProviders({
      providers: [speechProviderFrom({
        id: 'native',
        inferenceExecutor: {
          id: 'native-asr',
          transcription: (options) => {
            calls.push(options)
            return { baseURL: 'native://asr/', fetch: executorFetch, model: options.model }
          },
        },
        optionalEnv: { apiKey: 'NATIVE_API_KEY' },
      })],
    })
    const models = SpeechModels({ models: [transcriptionModelFrom({ id: 'native', model: 'native-model', provider: 'native' })] })
    const base = { env: { NATIVE_API_KEY: 'native-key' }, models: [] }
    const withProviders = await providers.configVieval!(base) ?? base
    const config = await models.configVieval!(withProviders) ?? withProviders
    const native = config.models![0]!

    expect(native.inferenceExecutorId).toBe('native-asr')
    const request = transcriptionRequestFromRunContext(native, { language: 'ja' })
    expect(request).toMatchObject({ baseURL: 'native://asr/', model: 'native-model' })
    expect(request.fetch).toBe(executorFetch)
    expect(calls).toEqual([{ language: 'ja', model: 'native-model', parameters: { apiKey: 'native-key', capability: 'transcription' } }])
  })

  it('sends the language only for a model that takes it', async () => {
    const providers = SpeechProviders({
      providers: [speechProviderFrom({ id: 'local', inferenceExecutor: 'openai', parameters: { baseURL: 'http://127.0.0.1:5933/v1/' } })],
    })
    const models = SpeechModels({
      models: [
        speechModelFrom({ id: 'official', model: 'stepfun/stepaudio-2.5-tts', provider: 'local', sendsLanguage: true, voice: 'jilingshaonv' }),
        speechModelFrom({ id: 'azure', model: 'microsoft/v1', provider: 'local', voice: 'en-US-AriaNeural' }),
      ],
    })
    const base = { env: {}, models: [] }
    const withProviders = await providers.configVieval!(base) ?? base
    const config = await models.configVieval!(withProviders) ?? withProviders
    const [official, azure] = config.models!

    expect(openaiSpeechFromRunContext(official!).sendsLanguage).toBe(true)
    expect(openaiSpeechFromRunContext(azure!).sendsLanguage).toBe(false)
  })

  it('throws when a model references an unknown provider', () => {
    const plugin = SpeechModels({ models: [speechModelFrom({ model: 'tts-1', provider: 'missing' })] })

    expect(() => plugin.configVieval?.({ models: [] })).toThrow('Unknown speech provider "missing"')
  })

  it('builds a matrix axis from model names', () => {
    expect(speechModelMatrix('tts', 'azure', 'official', 'azure')).toEqual({ tts: ['azure', 'official'] })
  })
})
