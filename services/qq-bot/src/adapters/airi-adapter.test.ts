import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QQAdapter } from './airi-adapter'

vi.mock('@proj-airi/server-sdk', () => {
  class Client {
    onEvent() {}
    send() {}
    close() {}
  }

  return {
    Client,
    ContextUpdateStrategy: {
      AppendSelf: 1,
    },
  }
})

vi.mock('@guiiai/logg', () => {
  const logger = {
    log: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    withError: vi.fn(() => logger),
  }

  return {
    useLogg: () => ({
      useGlobalConfig: () => logger,
    }),
  }
})

describe('qQAdapter voice reply', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sends text only when mode is text', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).voiceReplyMode = 'text'

    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendQQText = sendQQText

    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    expect(sendQQText).toHaveBeenCalledTimes(1)
    expect((adapter as any).voiceSendQueueByMessage.size).toBe(0)
  })

  it('sends text and schedules voice when mode is both', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).voiceReplyMode = 'both'

    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendQQText = sendQQText

    const generateAndSendVoiceOrFallback = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    ;(adapter as any).generateAndSendVoiceOrFallback = generateAndSendVoiceOrFallback

    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    const queued = (adapter as any).voiceSendQueueByMessage.get('c2c:m1')
    expect(queued).toBeInstanceOf(Promise)
    await queued

    expect(sendQQText).toHaveBeenCalledTimes(1)
    expect(generateAndSendVoiceOrFallback).toHaveBeenCalledTimes(1)
  })

  it('falls back to text when mode is voice but tts is missing', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).ttsConfig = null

    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendQQText = sendQQText

    await (adapter as any).generateAndSendVoiceOrFallback(
      'token',
      { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' },
      'hello',
      'voice',
    )

    expect(sendQQText).toHaveBeenCalledTimes(1)
  })

  it('falls back to text when voice generation fails', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).ttsConfig = { providerId: 'openai-audio-speech', model: 'tts-1', voice: 'alloy', providerConfig: { apiKey: 'x', baseUrl: 'https://api.openai.com/v1/' } }

    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendQQText = sendQQText

    ;(adapter as any).generateSpeechAudio = vi.fn(async () => {
      throw new Error('tts failed')
    })

    await (adapter as any).generateAndSendVoiceOrFallback(
      'token',
      { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' },
      'hello',
      'voice',
    )

    expect(sendQQText).toHaveBeenCalledTimes(1)
  })

  it('caps reply chunks to 5 for long outputs', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'

    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')

    const sendQQReply = vi.fn(async () => {})
    ;(adapter as any).sendQQReply = sendQQReply

    const longText = Array.from({ length: 20 }).fill('a'.repeat(500)).join('\n')
    const context = { kind: 'group', messageId: 'm1', groupOpenId: 'g1', userOpenId: 'u1' }

    await (adapter as any).handleAiriOutput({
      data: {
        message: longText,
        sourceTags: ['qq'],
        qq: context,
      },
    })

    expect(sendQQReply).toHaveBeenCalledTimes(5)
    const lastCall = sendQQReply.mock.calls[sendQQReply.mock.calls.length - 1] as unknown as any[]
    const lastArg = String(lastCall?.[2] ?? '')
    expect(lastArg.includes('…（后续内容已截断）')).toBe(true)
  })

  it('limits concurrent TTS generation to 2', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).ttsConfig = { providerId: 'openai-audio-speech', model: 'tts-1', voice: 'alloy', providerConfig: { apiKey: 'x', baseUrl: 'https://api.openai.com/v1/' } }

    let active = 0
    let maxActive = 0

    ;(adapter as any).generateSpeechAudio = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 30))
      active -= 1
      return Buffer.from('ID3')
    })

    ;(adapter as any).sendQQVoice = vi.fn(async () => {})
    ;(adapter as any).sendQQText = vi.fn(async () => {})

    const makeContext = (i: number) => ({ kind: 'c2c', messageId: `m${i}`, userOpenId: `u${i}` })
    const tasks = Array.from({ length: 6 }).map((_, i) => {
      return (adapter as any).generateAndSendVoiceOrFallback('token', makeContext(i), 'hello', 'voice')
    })

    await Promise.all(tasks)

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('re-emits ready status when gateway is already open and ready', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'
    ;(adapter as any).authState = { appId: '1', clientSecret: '2', accessToken: 't', expiresAt: Date.now() + 1000 }
    ;(adapter as any).gatewaySocket = { readyState: 1 }
    ;(adapter as any).gatewayReady = true

    const emitModuleStatus = vi.fn()
    ;(adapter as any).emitModuleStatus = emitModuleStatus

    await (adapter as any).connectGateway()

    expect(emitModuleStatus).toHaveBeenCalledWith('ready', expect.any(String))
  })
})
