import type { AddressInfo } from 'node:net'

import type { Client as ServerChannel } from '@proj-airi/server-sdk'

import type { PhotonBotConfig } from '../config'

import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Server } from 'socket.io'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotonAdapter } from './airi-adapter'

interface SentInput { type: string, data: { text: string, overrides: { binding: string }, photon: { messageId: string } }, route: unknown }

/** Stands in for the AIRI channel client. It records sends and lets a test emit server events. */
function createFakeAiri() {
  const listeners = new Map<string, (event: { data: unknown }) => void>()
  const sent: SentInput[] = []
  const client = {
    connectionStatus: 'ready',
    connect: async () => {},
    close: () => {},
    onEvent: (type: string, callback: (event: { data: unknown }) => void) => listeners.set(type, callback),
    send: (event: SentInput) => sent.push(event) > 0,
  } as unknown as ServerChannel

  return {
    client,
    sent,
    reply: (input: SentInput, content: string) => listeners.get('output:gen-ai:chat:message')?.({ data: { 'message': { content }, 'gen-ai:chat': { input } } }),
    replyMessage: (input: SentInput, message: unknown) => listeners.get('output:gen-ai:chat:message')?.({ data: { message, 'gen-ai:chat': { input } } }),
    refuse: () => listeners.get('error')?.({ data: { message: 'no consumer registered for requested event delivery' } }),
  }
}

function received(id: string, text: string) {
  return { type: 'message.received', data: { object: { id, space: { id: 'space-1' }, sentBy: { id: 'human-1', handle: '+15550100001' }, receivedBy: { id: 'agent-1', handle: '+15550100000' }, content: { type: 'text', text } } } }
}

describe('photonAdapter', () => {
  const http = createServer()
  const photon = new Server(http, { path: '/v1/projects/project-1/events/ws', addTrailingSlash: false, transports: ['websocket'] })
  const subscribes: number[] = []
  let config: PhotonBotConfig
  let adapter: PhotonAdapter

  beforeEach(async () => {
    subscribes.length = 0
    photon.removeAllListeners('connection')
    photon.on('connection', socket => socket.on('subscribe', (payload: { startSeq: number }, ack: (result: { ok: boolean }) => void) => {
      subscribes.push(payload.startSeq)
      ack({ ok: true })
    }))
    if (!http.listening)
      await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    config = {
      airiUrl: 'ws://127.0.0.1:1/ws',
      photonBaseUrl: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
      photonProjectId: 'project-1',
      photonApiKey: 'test-key',
      stateFile: join(mkdtempSync(join(tmpdir(), 'photon-bot-')), 'state.json'),
    }
  })

  afterEach(() => adapter.stop())
  afterAll(() => photon.close())

  it('answers an inbound text in its own session and saves the cursor after the send', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {
      expect(() => readFileSync(config.stateFile)).toThrow()
    })
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))

    photon.emit('delivery', received('message-1', 'hello'), { seq: 7 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    expect(airi.sent[0]).toMatchObject({
      type: 'input:text',
      data: { text: 'hello', overrides: { binding: 'photon:space-1:agent-1', messagePrefix: '(From iMessage user …0001): ' } },
      route: { delivery: { required: true } },
    })

    airi.reply(airi.sent[0], 'hi there')
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 7 }))
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ projectId: 'project-1' }),
      { spaceId: 'space-1', senderId: 'agent-1', text: 'hi there', idempotencyKey: 'airi-reply:message-1' },
    )
  })

  it('marks the text read and shows typing until the reply goes out', async () => {
    const airi = createFakeAiri()
    const steps: string[] = []
    const markRead = vi.fn(async () => {
      steps.push('read')
      return 202
    })
    const setTyping = vi.fn(async (_connection: unknown, _spaceId: string, _senderId: string, on: boolean) => {
      steps.push(on ? 'typing on' : 'typing off')
      return 202
    })
    const send = vi.fn(async () => {
      steps.push('send')
    })
    adapter = new PhotonAdapter(config, { markRead, setTyping, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toHaveLength(1))

    photon.emit('delivery', received('message-4', 'boo'), { seq: 9 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    expect(steps).toEqual(['read', 'typing on'])
    expect(markRead).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1' }), 'message-4')
    expect(setTyping).toHaveBeenCalledWith(expect.anything(), 'space-1', 'agent-1', true)

    airi.replyMessage(airi.sent[0], { content: '', categorization: { speech: '<|ACT {"emotion":"happy"}|> Boo to you too.' } })
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(steps).toEqual(['read', 'typing on', 'typing off', 'send'])
    expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: 'Boo to you too.' }))
  })

  it('still replies when the read receipt and typing fail', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    const fail = async () => {
      throw new Error('OPERATION_UNAVAILABLE')
    }
    adapter = new PhotonAdapter(config, { markRead: fail, setTyping: fail, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toHaveLength(1))

    photon.emit('delivery', received('message-5', 'hey'), { seq: 10 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    airi.reply(airi.sent[0], 'hello')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  })

  it('sends nothing when AIRI replies with no text', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toHaveLength(1))

    photon.emit('delivery', received('message-6', 'hm'), { seq: 11 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    airi.replyMessage(airi.sent[0], { content: '', categorization: { speech: '<|ACT {"emotion":"neutral"}|>' } })
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 11 }))
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the input again when AIRI has no consumer, and holds the cursor until the reply', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send, retryDelayMs: 10 })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toHaveLength(1))

    photon.emit('delivery', received('message-2', 'anyone there?'), { seq: 3 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    airi.refuse()
    await vi.waitFor(() => expect(airi.sent).toHaveLength(2))
    expect(send).not.toHaveBeenCalled()
    expect(() => readFileSync(config.stateFile)).toThrow()

    airi.reply(airi.sent[1], 'here now')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  })

  it('subscribes from the saved cursor after a restart and ignores outbound lifecycle events', async () => {
    const airi = createFakeAiri()
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toHaveLength(1))
    photon.emit('delivery', { type: 'message.accepted', data: { object: { id: 'message-3' } } }, { seq: 12 })
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 12 }))
    expect(airi.sent).toHaveLength(0)
    adapter.stop()

    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: createFakeAiri().client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0, 12]))
  })
})
