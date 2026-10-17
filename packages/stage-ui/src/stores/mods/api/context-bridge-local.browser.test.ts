import type { ChatStreamEvent, ChatStreamEventContext } from '../../../types/chat'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia } from 'pinia'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatStore } from '../../chat'
import { useModsServerChannelStore } from './channel-server'
import { useContextBridgeStore } from './context-bridge'
import { createContextChannel } from './context-channel'

const context: ChatStreamEventContext = {
  sessionId: 'local-stream-session',
  turnId: 'local-stream-turn',
  message: { role: 'user', content: 'hello' },
  contexts: {},
  composedMessage: [],
}

async function localRuntime() {
  const pinia = createPinia()
  let bridge!: ReturnType<typeof useContextBridgeStore>
  let chat!: ReturnType<typeof useChatStore>
  let connect!: ReturnType<typeof vi.spyOn>
  let send!: ReturnType<typeof vi.spyOn>
  const Host = defineComponent({
    setup() {
      const server = useModsServerChannelStore()
      connect = vi.spyOn(server, 'ensureConnected').mockRejectedValue(new Error('No server in this test'))
      send = vi.spyOn(server, 'send')
      bridge = useContextBridgeStore()
      chat = useChatStore()
      return () => null
    },
  })
  const view = await render(Host, {
    global: { plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })] },
  })
  const receiver = createContextChannel()
  const received: ChatStreamEvent[] = []
  receiver.onStream((event) => {
    received.push(event)
  })
  onTestFinished(async () => {
    await bridge.dispose()
    receiver.dispose(new Error('Test complete'))
    view.unmount()
    disposePinia(pinia)
    vi.restoreAllMocks()
  })
  await bridge.initializeLocal()
  return { bridge, chat, connect, send, received }
}

describe('local context bridge', () => {
  it('publishes each chat event once across repeated startup without a server', async () => {
    const { bridge, chat, connect, send, received } = await localRuntime()
    await bridge.initializeLocal()
    await chat.emitBeforeSendHooks('hello', context)
    await chat.emitTokenLiteralHooks('answer', context)
    await vi.waitFor(() => expect(received).toHaveLength(2))
    expect(received.map(event => event.type)).toEqual(['before-send', 'token-literal'])
    expect(received[1]?.sessionId).toBe(context.sessionId)
    expect(received[1]?.context.turnId).toBe(context.turnId)
    expect(connect).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()

    await bridge.dispose()
    await bridge.initializeLocal()
    await chat.emitTokenLiteralHooks('after restart', context)
    await vi.waitFor(() => expect(received).toHaveLength(3))
  })

  it('keeps the local stream alive after rejecting a change to server mode', async () => {
    const { bridge, chat, connect, received } = await localRuntime()
    await expect(bridge.initialize()).rejects.toThrow('Dispose the local chat runtime')
    await chat.emitTokenLiteralHooks('still alive', context)
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]?.type).toBe('token-literal')
    expect(connect).not.toHaveBeenCalled()
  })
})
