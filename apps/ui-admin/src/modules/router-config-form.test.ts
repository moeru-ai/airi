import { describe, expect, it } from 'vitest'

import {
  buildRouterConfigRequest,
  createRouterConfigFormState,
  createRouterSliceDraft,
  defaultTtsVoicesJson,
  formatRouterConfigRequestJson,
  formStateFromRequestJson,
  validateRouterConfigForm,
} from './router-config-form'

describe('router config form builder', () => {
  it('compiles the default OpenRouter chat setup', () => {
    const form = createRouterConfigFormState()
    const openrouter = form.slices[0]
    if (openrouter.kind !== 'openrouter')
      throw new Error('expected default slice to be OpenRouter')
    openrouter.plaintextKey = 'sk-openrouter'

    expect(buildRouterConfigRequest(form)).toEqual({
      errors: [],
      request: {
        mode: 'merge',
        slices: [{
          kind: 'openrouter',
          modelName: 'chat-default',
          overrideModel: 'openai/gpt-4o-mini',
          plaintextKey: 'sk-openrouter',
          baseURL: 'https://openrouter.ai/api/v1',
        }],
        defaults: {
          chatModel: 'chat-default',
        },
      },
    })
  })

  it('compiles Azure speech defaults without OpenRouter-only fields', () => {
    const azure = createRouterSliceDraft('azure', 'azure-test')
    azure.plaintextKey = 'azure-key'
    azure.defaultVoice = 'zh-CN-XiaoxiaoNeural'
    azure.keyEntryId = 'azure-eastasia-1'
    const form = {
      mode: 'merge' as const,
      slices: [azure],
      defaults: {
        chatModel: '',
        ttsModel: 'microsoft/v1',
        ttsVoicesJson: '',
      },
    }

    expect(buildRouterConfigRequest(form).request).toEqual({
      mode: 'merge',
      slices: [{
        kind: 'azure',
        modelName: 'microsoft/v1',
        region: 'eastasia',
        defaultVoice: 'zh-CN-XiaoxiaoNeural',
        plaintextKey: 'azure-key',
        keyEntryId: 'azure-eastasia-1',
      }],
      defaults: {
        ttsModel: 'microsoft/v1',
      },
    })
  })

  it('preserves DashScope region and upstream model', () => {
    const dashscope = createRouterSliceDraft('dashscope-cosyvoice', 'dashscope-test')
    dashscope.region = 'cn'
    dashscope.upstreamModel = 'cosyvoice-v1'
    dashscope.plaintextKey = 'dashscope-key'

    expect(buildRouterConfigRequest({
      mode: 'merge',
      slices: [dashscope],
      defaults: { chatModel: '', ttsModel: '', ttsVoicesJson: '' },
    }).request?.slices).toEqual([{
      kind: 'dashscope-cosyvoice',
      modelName: 'alibaba/cosyvoice-v2',
      region: 'cn',
      upstreamModel: 'cosyvoice-v1',
      plaintextKey: 'dashscope-key',
    }])
  })

  it('compiles StepFun optional instruction and voice fields', () => {
    const stepfun = createRouterSliceDraft('stepfun', 'stepfun-test')
    stepfun.plaintextKey = 'stepfun-key'
    stepfun.defaultVoice = 'cixingnansheng'
    stepfun.instruction = 'Speak warmly'

    expect(buildRouterConfigRequest({
      mode: 'merge',
      slices: [stepfun],
      defaults: { chatModel: '', ttsModel: '', ttsVoicesJson: '' },
    }).request?.slices).toEqual([{
      kind: 'stepfun',
      modelName: 'stepfun/stepaudio-2.5-tts',
      upstreamModel: 'stepaudio-2.5-tts',
      defaultVoice: 'cixingnansheng',
      instruction: 'Speak warmly',
      plaintextKey: 'stepfun-key',
    }])
  })

  it('compiles UnSpeech REST-only and streaming requests', () => {
    const restOnly = createRouterSliceDraft('unspeech', 'unspeech-rest')
    const streaming = createRouterSliceDraft('unspeech', 'unspeech-stream')
    streaming.streamingEnabled = true
    streaming.streamingPlaintextKey = 'volcengine-key'
    streaming.streamingDefaultModel = 'volcengine/seed-tts-2.0'

    expect(buildRouterConfigRequest({
      mode: 'merge',
      slices: [restOnly],
      defaults: { chatModel: '', ttsModel: '', ttsVoicesJson: '' },
    }).request?.slices).toEqual([{
      kind: 'unspeech',
      restBaseURL: 'http://airi-unspeech.railway.internal:5933',
    }])

    expect(buildRouterConfigRequest({
      mode: 'merge',
      slices: [streaming],
      defaults: { chatModel: '', ttsModel: '', ttsVoicesJson: '' },
    }).request?.slices).toEqual([{
      kind: 'unspeech',
      restBaseURL: 'http://airi-unspeech.railway.internal:5933',
      streaming: {
        upstreamURL: 'ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream',
        plaintextKey: 'volcengine-key',
        models: [{
          id: 'volcengine/seed-tts-2.0',
          name: 'Seed TTS 2.0',
        }],
        defaultModel: 'volcengine/seed-tts-2.0',
      },
    }])
  })

  it('validates missing keys, URL schemes, empty aliases, and duplicate UnSpeech slices', () => {
    const openrouter = createRouterSliceDraft('openrouter', 'bad-openrouter')
    openrouter.modelName = ''
    openrouter.baseURL = 'ftp://openrouter.local'
    const unspeechA = createRouterSliceDraft('unspeech', 'unspeech-a')
    const unspeechB = createRouterSliceDraft('unspeech', 'unspeech-b')
    unspeechA.streamingEnabled = true
    unspeechA.streamingUpstreamURL = 'https://not-websocket.local'

    expect(validateRouterConfigForm({
      mode: 'merge',
      slices: [openrouter, unspeechA, unspeechB],
      defaults: { chatModel: '', ttsModel: '', ttsVoicesJson: '' },
    })).toEqual(expect.arrayContaining([
      'Only one UnSpeech slice can be submitted at a time.',
      'Slice 1 (OpenRouter): model alias is required.',
      'Slice 1 (OpenRouter): provider key is required unless an existing key is loaded.',
      'Slice 1 (OpenRouter): base URL must start with http:// or https://.',
      'Slice 2 (UnSpeech): streaming URL must start with ws:// or wss://.',
      'Slice 2 (UnSpeech): streaming provider key is required unless an existing key is loaded.',
    ]))
  })

  it('preserves loaded existing key entries when plaintext fields are blank', () => {
    const imported = formStateFromRequestJson(JSON.stringify({
      mode: 'merge',
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        baseURL: 'https://openrouter.ai/api/v1',
        keyEntryId: 'openrouter-prod-1',
        existingKeyEntryId: 'openrouter-prod-1',
      }],
      defaults: {
        chatModel: 'chat-default',
      },
    }))

    expect(buildRouterConfigRequest(imported)).toEqual({
      errors: [],
      request: {
        mode: 'merge',
        slices: [{
          kind: 'openrouter',
          modelName: 'chat-default',
          overrideModel: 'openai/gpt-4o-mini',
          baseURL: 'https://openrouter.ai/api/v1',
          keyEntryId: 'openrouter-prod-1',
          existingKeyEntryId: 'openrouter-prod-1',
        }],
        defaults: {
          chatModel: 'chat-default',
        },
      },
    })
  })

  it('round-trips supported advanced JSON through form import and export', () => {
    const form = createRouterConfigFormState()
    const openrouter = form.slices[0]
    if (openrouter.kind !== 'openrouter')
      throw new Error('expected default slice to be OpenRouter')
    openrouter.plaintextKey = 'sk-openrouter'
    form.defaults.ttsVoicesJson = defaultTtsVoicesJson()
    const request = buildRouterConfigRequest(form).request
    if (!request)
      throw new Error('expected valid request')

    const imported = formStateFromRequestJson(formatRouterConfigRequestJson(request))
    expect(buildRouterConfigRequest(imported).request).toEqual(request)
  })

  it('rejects unsupported advanced JSON slice kinds', () => {
    expect(() => formStateFromRequestJson(JSON.stringify({
      mode: 'merge',
      slices: [{ kind: 'future-provider' }],
    }))).toThrow('Unsupported router slice kind "future-provider".')
  })
})
