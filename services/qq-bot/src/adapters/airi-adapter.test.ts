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

  it('sends text and schedules voice when mode is both, and triggers meme fallback if configured', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).voiceReplyMode = 'both'
    ;(adapter as any).ttsConfig = { providerId: 'test', model: 'test' }
    ;(adapter as any).method = 'official'
    ;(adapter as any).memeProbability = 1.0 // Force meme sending
    ;(adapter as any).aiGirlfriendEnabled = false

    const ensureAccessToken = vi.fn(async () => 'token')
    ;(adapter as any).ensureAccessToken = ensureAccessToken

    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendQQText = sendQQText

    const waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).waitReplyInterval = waitReplyInterval

    const maybeSendMeme = vi.fn(async () => true)
    ;(adapter as any).maybeSendMeme = maybeSendMeme

    const generateAndSendVoiceOrFallback = vi.fn(async () => true)
    ;(adapter as any).generateAndSendVoiceOrFallback = generateAndSendVoiceOrFallback

    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    // Text is sent immediately
    expect(sendQQText).toHaveBeenCalledWith('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    // Voice is enqueued
    const queued = (adapter as any).voiceSendQueueByMessage.get('c2c:m1')
    expect(queued).toBeInstanceOf(Promise)
    await queued

    // Voice and meme should be generated/sent
    expect(generateAndSendVoiceOrFallback).toHaveBeenCalledTimes(1)
    expect(maybeSendMeme).toHaveBeenCalledTimes(1)
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

  it('caps reply messages to 5 for long outputs without truncation marker', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'

    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    const waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).waitReplyInterval = waitReplyInterval
    ;(adapter as any).getSessionQueue = vi.fn(() => ({ enqueue: (task: any) => task() }))

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
    const lastCall = sendQQReply.mock.calls.at(-1) as unknown as any[]
    const lastArg = String(lastCall?.[2] ?? '')
    expect(lastArg.includes('截断')).toBe(false)
  })

  it('parses multi-message format and counts emoji replies within max 5', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'
    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    const waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).waitReplyInterval = waitReplyInterval
    ;(adapter as any).getSessionQueue = vi.fn(() => ({ enqueue: (task: any) => task() }))

    const sendQQReply = vi.fn(async () => {})
    ;(adapter as any).sendQQReply = sendQQReply

    const context = { kind: 'group', messageId: 'm1', groupOpenId: 'g1', userOpenId: 'u1' }
    const modelOutput = [
      '第一条',
      '',
      '😄',
      '',
      '第三条',
      '',
      '第四条',
      '',
      '第五条',
      '',
      '第六条',
    ].join('\n')

    await (adapter as any).handleAiriOutput({
      data: {
        message: modelOutput,
        sourceTags: ['qq'],
        qq: context,
      },
    })

    expect(sendQQReply).toHaveBeenCalledTimes(5)
    const sentContents = sendQQReply.mock.calls.map((call) => {
      const args = call as unknown as any[]
      return args[2]
    })
    expect(sentContents).toEqual(['第一条', '😄', '第三条', '第四条', '第五条'])
    expect(waitReplyInterval).toHaveBeenCalledTimes(4)
  })

  it('treats markdown image syntax as plain text and caps total replies to 5', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'
    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    ;(adapter as any).waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).getSessionQueue = vi.fn(() => ({ enqueue: (task: any) => task() }))

    const sendQQReply = vi.fn(async () => {})
    ;(adapter as any).sendQQReply = sendQQReply

    const context = { kind: 'group', messageId: 'm-mixed', groupOpenId: 'g1', userOpenId: 'u1' }
    const modelOutput = [
      '第一条文本',
      '',
      '![meme](https://example.com/meme-1.jpg)',
      '',
      '第二条文本',
      '',
      '![meme](https://example.com/meme-2.jpg)',
      '',
      '第三条文本',
      '',
      '第四条文本',
    ].join('\n')

    await (adapter as any).handleAiriOutput({
      data: {
        message: modelOutput,
        sourceTags: ['qq'],
        qq: context,
      },
    })

    expect(sendQQReply).toHaveBeenCalledTimes(5)
    expect(sendQQReply.mock.calls.map(call => (call as unknown as any[])[2])).toEqual([
      '第一条文本',
      '![meme](https://example.com/meme-1.jpg)',
      '第二条文本',
      '![meme](https://example.com/meme-2.jpg)',
      '第三条文本',
    ])
  })

  it('injects QQ multi-message prompt into context updates', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const send = vi.fn()
    ;(adapter as any).airiClient = { send, onEvent: vi.fn(), close: vi.fn() }

    await (adapter as any).sendInputToAiri({
      content: '你好',
      rawContent: '你好',
      context: { kind: 'c2c', messageId: 'm-prompt', userOpenId: 'u1' },
      senderDisplayName: 'Tester',
    })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0]
    const contextUpdates = payload?.data?.contextUpdates ?? []
    expect(contextUpdates).toHaveLength(2)
    expect(contextUpdates[1]?.text).toContain('模拟 QQ 聊天软件')
    expect(contextUpdates[1]?.text).toContain('最多 5 段')
    expect(contextUpdates[1]?.text).toContain('(\\n\\n) 进行分段')
  })

  it('forwards inbound media as attachments when vision input is supported', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const send = vi.fn()
    ;(adapter as any).airiClient = { send, onEvent: vi.fn(), close: vi.fn() }
    ;(adapter as any).supportsImageInput = true
    ;(adapter as any).supportsVideoInput = true

    await (adapter as any).sendInputToAiri({
      content: '帮我看看这张图',
      rawContent: '帮我看看这张图',
      context: { kind: 'c2c', messageId: 'm-vision-ok', userOpenId: 'u1' },
      senderDisplayName: 'Tester',
      mediaAttachments: [{
        kind: 'image',
        url: 'https://example.com/media.jpg',
      }],
    })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0]
    expect(payload?.data?.text).toBe('帮我看看这张图')
    expect(payload?.data?.text).not.toContain('[图片消息]')
    expect(payload?.data?.attachments).toEqual([{
      type: 'image_url',
      image_url: {
        url: 'https://example.com/media.jpg',
      },
    }])
    expect(payload?.data?.contextUpdates?.[1]?.text).not.toContain('已降级为文本占位')
  })

  it('degrades inbound media to placeholders when vision input is not supported', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const send = vi.fn()
    ;(adapter as any).airiClient = { send, onEvent: vi.fn(), close: vi.fn() }
    ;(adapter as any).supportsImageInput = false
    ;(adapter as any).supportsVideoInput = false

    await (adapter as any).sendInputToAiri({
      content: '你能识别吗？',
      rawContent: '你能识别吗？',
      context: { kind: 'c2c', messageId: 'm-vision-no', userOpenId: 'u1' },
      senderDisplayName: 'Tester',
      mediaAttachments: [{
        kind: 'image',
        url: 'https://example.com/media.jpg',
      }, {
        kind: 'video',
        url: 'https://example.com/media.mp4',
      }],
    })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0]
    expect(payload?.data?.text).toContain('[图片消息]')
    expect(payload?.data?.text).toContain('[视频消息]')
    expect(payload?.data?.text).not.toContain('https://example.com/media.jpg')
    expect(payload?.data?.attachments).toBeUndefined()
    expect(payload?.data?.contextUpdates?.[1]?.text).toContain('已降级为文本占位')
    expect(payload?.data?.contextUpdates?.[1]?.text).not.toContain('请明确告知')
  })

  it('forwards QQ media-only messages instead of dropping them', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const sendInputToAiri = vi.fn(async () => {})
    ;(adapter as any).sendInputToAiri = sendInputToAiri

    await (adapter as any).handleC2CMessage({
      id: 'm-media-only',
      content: '',
      timestamp: new Date().toISOString(),
      author: {
        user_openid: 'u-media',
        username: 'Alice',
      },
      attachments: [{
        content_type: 'image/jpeg',
        filename: 'photo.jpg',
        url: 'https://example.com/photo.jpg',
      }],
    })

    expect(sendInputToAiri).toHaveBeenCalledTimes(1)
    const firstCall = sendInputToAiri.mock.calls[0] as unknown as any[] | undefined
    const call = firstCall?.[0] as any
    expect(call?.mediaAttachments).toEqual([{
      kind: 'image',
      url: 'https://example.com/photo.jpg',
      contentType: 'image/jpeg',
      filename: 'photo.jpg',
    }])
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

  it('sends proactive c2c text without msg_id/msg_seq', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const qqApiRequest = vi.fn(async () => {})
    ;(adapter as any).qqApiRequest = qqApiRequest

    await (adapter as any).sendQQText('token', { kind: 'c2c', userOpenId: 'u1' }, 'hello proactive')

    expect(qqApiRequest).toHaveBeenCalledTimes(1)
    const call = qqApiRequest.mock.calls[0] as unknown as [string, 'POST' | 'GET', string, Record<string, unknown>]
    const body = call[3]
    expect(body).toBeDefined()
    expect(body.msg_id).toBeUndefined()
    expect(body.msg_seq).toBeUndefined()
  })

  it('sends proactive c2c voice without msg_id/msg_seq', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const qqApiRequestJson = vi.fn(async () => ({ file_info: 'f1' }))
    const qqApiRequest = vi.fn(async () => {})
    ;(adapter as any).qqApiRequestJson = qqApiRequestJson
    ;(adapter as any).qqApiRequest = qqApiRequest

    await (adapter as any).sendQQVoice('token', { kind: 'c2c', userOpenId: 'u1' }, Buffer.from('ID3'))

    expect(qqApiRequest).toHaveBeenCalledTimes(1)
    const call = qqApiRequest.mock.calls[0] as unknown as [string, 'POST' | 'GET', string, Record<string, unknown>]
    const body = call[3]
    expect(body).toBeDefined()
    expect(body.msg_id).toBeUndefined()
    expect(body.msg_seq).toBeUndefined()
  })

  it('binds account when receiving #绑定此账号', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    ;(adapter as any).sendQQText = vi.fn(async () => {})
    ;(adapter as any).savePersistentState = vi.fn(async () => {})

    const handled = await (adapter as any).tryHandleBuiltInCommand(
      { kind: 'c2c', messageId: 'm-bind', userOpenId: 'u-bind' },
      '#绑定此账号',
    )

    expect(handled).toBe(true)
    expect((adapter as any).boundAccountsByKey.has('u-bind')).toBe(true)
    expect((adapter as any).sendQQText).toHaveBeenCalledTimes(1)
  })

  it('handles #绑定此账号 locally without forwarding to AIRI', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    ;(adapter as any).sendQQText = vi.fn(async () => {})
    ;(adapter as any).sendInputToAiri = vi.fn(async () => {})

    await (adapter as any).handleC2CMessage({
      id: 'm-bind-local',
      content: '#绑定此账号',
      timestamp: new Date().toISOString(),
      author: {
        user_openid: 'u-bind-local',
        username: 'Alice',
      },
    })

    expect((adapter as any).boundAccountsByKey.has('u-bind-local')).toBe(true)
    expect((adapter as any).sendQQText).toHaveBeenCalledTimes(1)
    expect((adapter as any).sendInputToAiri).not.toHaveBeenCalled()
  })

  it('executes qq.send_meme directive from assistant tool-call slices', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'
    ;(adapter as any).ensureAccessToken = vi.fn(async () => 'token')
    ;(adapter as any).waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).getSessionQueue = vi.fn(() => ({ enqueue: (task: any) => task() }))
    ;(adapter as any).sendQQReply = vi.fn(async () => {})
    const maybeSendMeme = vi.fn(async () => true)
    ;(adapter as any).maybeSendMeme = maybeSendMeme

    const context = { kind: 'group', messageId: 'm-tool-meme', groupOpenId: 'g1', userOpenId: 'u1' }
    await (adapter as any).handleAiriOutput({
      data: {
        message: {
          role: 'assistant',
          content: '已发送',
          slices: [{
            type: 'tool-call',
            toolCall: {
              toolName: 'qq.send_meme',
              args: JSON.stringify({ state: '开心' }),
              toolCallId: 'call-1',
              toolCallType: 'function',
            },
          }],
          tool_results: [],
        },
        sourceTags: ['qq'],
        qq: context,
      },
    })

    expect(maybeSendMeme).toHaveBeenCalledTimes(1)
    expect(maybeSendMeme).toHaveBeenCalledWith('token', context, '开心', true)
    expect((adapter as any).sendQQReply).toHaveBeenCalledTimes(1)
  })

  it('sends random memes when aiGirlfriendEnabled is false but probability triggers it', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).aiGirlfriendEnabled = false
    ;(adapter as any).memeProbability = 1.0 // 100% chance
    ;(adapter as any).boundAccountsByKey = new Set(['official:u1'])
    ;(adapter as any).method = 'official'

    const maybeSendMeme = vi.fn(async () => true)
    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).maybeSendMeme = maybeSendMeme
    ;(adapter as any).sendQQText = sendQQText

    const waitReplyInterval = vi.fn(async () => {})
    ;(adapter as any).waitReplyInterval = waitReplyInterval

    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    // It should send text FIRST, and then wait, and then send meme
    expect(sendQQText).toHaveBeenCalledTimes(1)
    expect(waitReplyInterval).toHaveBeenCalledTimes(1)
    expect(maybeSendMeme).toHaveBeenCalledTimes(1)
  })

  it('defers meme and voice generation to AI in aiGirlfriendEnabled mode', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).aiGirlfriendEnabled = true
    ;(adapter as any).boundAccountsByKey = new Set(['u1'])
    ;(adapter as any).method = 'official'

    const sendQQText = vi.fn(async () => {})
    const maybeSendMeme = vi.fn(async () => true)
    ;(adapter as any).sendQQText = sendQQText
    ;(adapter as any).maybeSendMeme = maybeSendMeme

    // Even with voice configured, it should stick to text by default because AI decides via skills
    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm1', userOpenId: 'u1' }, 'hello')

    expect(sendQQText).toHaveBeenCalledTimes(1)
    expect(maybeSendMeme).not.toHaveBeenCalled()
  })

  it('triggers proactive messages during daytime', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).aiGirlfriendEnabled = true
    ;(adapter as any).boundAccountsByKey = new Set(['u1'])

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T12:00:00+08:00')) // 12 PM UTC+8

    const sendInputToAiri = vi.fn(async () => {})
    ;(adapter as any).sendInputToAiri = sendInputToAiri

    const originalRandom = Math.random
    Math.random = () => 0

    await (adapter as any).checkProactiveMessages()

    Math.random = originalRandom
    vi.useRealTimers()

    expect(sendInputToAiri).toHaveBeenCalledTimes(1)
    const call = sendInputToAiri.mock.calls[0] as unknown as any[]
    expect(call[0].content).toContain('系统提示：触发主动消息推送')
  })

  it('treats [meme:state] as plain text and does not auto-send meme in normal mode', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    ;(adapter as any).moduleEnabled = true
    ;(adapter as any).method = 'official'
    ;(adapter as any).memeProbability = 0 // Disable random meme

    const maybeSendMeme = vi.fn(async () => true)
    const sendQQText = vi.fn(async () => {})
    ;(adapter as any).maybeSendMeme = maybeSendMeme
    ;(adapter as any).sendQQText = sendQQText

    await (adapter as any).sendQQReply('token', { kind: 'c2c', messageId: 'm-meme-text', userOpenId: 'u1' }, '[meme:开心] 你好')

    expect((adapter as any).maybeSendMeme).not.toHaveBeenCalled()
    expect((adapter as any).sendQQText).toHaveBeenCalledWith('token', { kind: 'c2c', messageId: 'm-meme-text', userOpenId: 'u1' }, '[meme:开心] 你好')
  })

  it('does not support qq.unbind skill command', async () => {
    const adapter = new QQAdapter({ qqToken: '1:2', airiToken: 'x', airiUrl: 'ws://localhost:1/ws' })
    const result = await (adapter as any).executeSkillDirective('token', { kind: 'c2c', userOpenId: 'u1' }, {
      name: 'qq.unbind',
      payload: {},
      remainingText: '',
    })

    expect(result).toContain('未识别的 skill')
  })
})
