import type { AddressInfo } from 'node:net'

import type { Client as ServerChannel } from '@proj-airi/server-sdk'

import type { PhotonBotConfig } from '../config'

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { Server } from 'socket.io'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PhotonAuthError } from '../photon/client'
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
    configure: (config: unknown) => listeners.get('module:configure')?.({ data: { config } }),
  }
}

function received(id: string, text: string) {
  return { type: 'message.received', data: { object: { id, space: { id: 'space-1' }, sentBy: { id: 'human-1', handle: '+15550100001' }, receivedBy: { id: 'agent-1', handle: '+15550100000' }, content: { type: 'text', text } } } }
}

describe('photonAdapter', () => {
  const http = createServer()
  const photon = new Server(http, { path: '/v1/projects/project-1/events/ws', addTrailingSlash: false, transports: ['websocket'] })
  const subscribes: number[] = []
  const apiKeys: (string | undefined)[] = []
  let disconnects = 0
  let refusedHandshakes = 0
  let config: PhotonBotConfig
  let adapter: PhotonAdapter

  // Photon answers 401 to the handshake of the event stream when the API key is wrong or revoked.
  http.prependListener('upgrade', (request, socket) => {
    if (request.headers.authorization !== 'Bearer revoked-key')
      return
    refusedHandshakes += 1
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
  })

  beforeEach(async () => {
    subscribes.length = 0
    apiKeys.length = 0
    disconnects = 0
    refusedHandshakes = 0
    photon.removeAllListeners('connection')
    photon.on('connection', (socket) => {
      apiKeys.push(socket.handshake.headers.authorization)
      socket.on('disconnect', () => disconnects += 1)
      socket.on('subscribe', (payload: { startSeq: number }, ack: (result: { ok: boolean }) => void) => {
        subscribes.push(payload.startSeq)
        ack({ ok: true })
      })
    })
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

  afterEach(async () => {
    adapter.stop()
    vi.restoreAllMocks()
    // The next test counts disconnects, so the stand-in must see this one first.
    await vi.waitFor(() => expect(photon.sockets.sockets.size).toBe(0))
  })
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
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 7, projectId: 'project-1' }))
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
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 11, projectId: 'project-1' }))
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
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 12, projectId: 'project-1' }))
    expect(airi.sent).toHaveLength(0)
    adapter.stop()

    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: createFakeAiri().client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0, 12]))
  })

  it('waits for the settings from AIRI when the environment has no Photon credentials', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter({ ...config, photonProjectId: undefined, photonApiKey: undefined }, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send })
    adapter.start()

    airi.configure({ enabled: true, projectId: ' project-1 ', apiKey: 'key-from-airi' })
    await vi.waitFor(() => expect(subscribes).toEqual([0]))
    expect(apiKeys).toEqual(['Bearer key-from-airi'])

    photon.emit('delivery', received('message-7', 'hello'), { seq: 4 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    airi.reply(airi.sent[0], 'hi there')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(send).toHaveBeenCalledWith(
      { baseUrl: config.photonBaseUrl, projectId: 'project-1', apiKey: 'key-from-airi' },
      expect.objectContaining({ text: 'hi there' }),
    )
  })

  it('stops when AIRI disables the module, and replays the text in progress when AIRI enables it again', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))
    photon.emit('delivery', received('message-8', 'still there?'), { seq: 5 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))

    airi.configure({ enabled: false, projectId: 'project-1', apiKey: 'test-key' })
    await vi.waitFor(() => expect(disconnects).toBe(1))
    airi.reply(airi.sent[0], 'too late')
    expect(send).not.toHaveBeenCalled()
    expect(() => readFileSync(config.stateFile)).toThrow()

    airi.configure({ enabled: true, projectId: 'project-1', apiKey: 'test-key' })
    await vi.waitFor(() => expect(subscribes).toEqual([0, 0]))
    photon.emit('delivery', received('message-8', 'still there?'), { seq: 5 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(2))
    airi.reply(airi.sent[1], 'yes')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ text: 'yes', idempotencyKey: 'airi-reply:message-8' }))
  })

  it('stops when AIRI enables the module without an API key', async () => {
    const airi = createFakeAiri()
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))

    airi.configure({ enabled: true, projectId: 'project-1', apiKey: '' })
    await vi.waitFor(() => expect(disconnects).toBe(1))
  })

  it('connects again with a new API key and keeps the cursor of the project', async () => {
    const airi = createFakeAiri()
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))
    photon.emit('delivery', { type: 'message.accepted', data: { object: { id: 'message-9' } } }, { seq: 6 })
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 6, projectId: 'project-1' }))

    airi.configure({ enabled: true, projectId: 'project-1', apiKey: 'new-key' })
    await vi.waitFor(() => expect(subscribes).toEqual([0, 6]))
    expect(apiKeys).toEqual(['Bearer test-key', 'Bearer new-key'])
  })

  it('starts another project at the live end of its stream', async () => {
    const otherHttp = createServer()
    const otherPhoton = new Server(otherHttp, { path: '/v1/projects/project-2/events/ws', addTrailingSlash: false, transports: ['websocket'] })
    const otherSubscribes: number[] = []
    otherPhoton.on('connection', socket => socket.on('subscribe', (payload: { startSeq: number }, ack: (result: { ok: boolean }) => void) => {
      otherSubscribes.push(payload.startSeq)
      ack({ ok: true })
    }))
    await new Promise<void>(resolve => otherHttp.listen(0, '127.0.0.1', resolve))

    const airi = createFakeAiri()
    adapter = new PhotonAdapter({ ...config, photonBaseUrl: `http://127.0.0.1:${(otherHttp.address() as AddressInfo).port}`, photonProjectId: undefined, photonApiKey: undefined }, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send: vi.fn() })
    writeFileSync(config.stateFile, JSON.stringify({ cursor: 12, projectId: 'project-1' }))
    adapter.start()

    airi.configure({ enabled: true, projectId: 'project-2', apiKey: 'other-key' })
    await vi.waitFor(() => expect(otherSubscribes).toEqual([0]))
    otherPhoton.emit('delivery', { type: 'message.accepted', data: { object: { id: 'message-10' } } }, { seq: 2 })
    await vi.waitFor(() => expect(JSON.parse(readFileSync(config.stateFile, 'utf8'))).toEqual({ cursor: 2, projectId: 'project-2' }))

    adapter.stop()
    await otherPhoton.close()
  })

  it('names a rejected API key in the log and does not connect again every few seconds', async () => {
    const error = vi.spyOn(console, 'error')
    adapter = new PhotonAdapter({ ...config, photonApiKey: 'revoked-key' }, { markRead: async () => 202, setTyping: async () => 202, airiClient: createFakeAiri().client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(refusedHandshakes).toBe(1))

    // Socket.IO alone connects again 0.5 to 1.5 seconds after a refused handshake.
    await sleep(1700)
    expect(refusedHandshakes).toBe(1)
    const lines = error.mock.calls.map(call => String(call[0])).filter(line => line.includes('rejected the API key'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('Photon rejected the API key for project project-1 (401). Update the key on the iMessage page of AIRI')
  })

  it('waits longer after each rejection, logs the cause one time, and connects at once with a new key', async () => {
    const error = vi.spyOn(console, 'error')
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter({ ...config, photonApiKey: 'revoked-key' }, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send, authRetryDelayMs: 20 })
    adapter.start()
    await vi.waitFor(() => expect(refusedHandshakes).toBeGreaterThanOrEqual(3))
    expect(error.mock.calls.filter(call => String(call[0]).includes('rejected the API key'))).toHaveLength(1)

    airi.configure({ enabled: true, projectId: 'project-1', apiKey: 'new-key' })
    await vi.waitFor(() => expect(subscribes).toEqual([0]))
    photon.emit('delivery', received('message-12', 'hello again'), { seq: 3 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))
    airi.reply(airi.sent[0], 'welcome back')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  })

  it('tries a rejected API key again at once when AIRI sends the same settings', async () => {
    const airi = createFakeAiri()
    adapter = new PhotonAdapter({ ...config, photonApiKey: 'revoked-key' }, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send: vi.fn() })
    adapter.start()
    await vi.waitFor(() => expect(refusedHandshakes).toBe(1))

    airi.configure({ enabled: true, projectId: 'project-1', apiKey: 'revoked-key' })
    await vi.waitFor(() => expect(refusedHandshakes).toBe(2))
  })

  it('does not ask AIRI for a reply when Photon rejects the API key on the read receipt', async () => {
    const airi = createFakeAiri()
    const markRead = vi.fn(async () => {
      throw new PhotonAuthError('Photon refused the read receipt: 401', 401)
    })
    adapter = new PhotonAdapter(config, { markRead, setTyping: async () => 202, airiClient: airi.client, send: vi.fn(), authRetryDelayMs: 20 })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))

    photon.emit('delivery', received('message-13', 'anyone?'), { seq: 4 })
    await vi.waitFor(() => expect(disconnects).toBe(1))
    expect(airi.sent).toHaveLength(0)
    expect(() => readFileSync(config.stateFile)).toThrow()
    // The stream connects again after the wait, from the same cursor.
    await vi.waitFor(() => expect(subscribes).toEqual([0, 0]))
  })

  it('ignores settings that are not valid and keeps the stream when the settings do not change', async () => {
    const airi = createFakeAiri()
    const send = vi.fn(async () => {})
    adapter = new PhotonAdapter(config, { markRead: async () => 202, setTyping: async () => 202, airiClient: airi.client, send })
    adapter.start()
    await vi.waitFor(() => expect(subscribes).toEqual([0]))
    photon.emit('delivery', received('message-11', 'hello'), { seq: 8 })
    await vi.waitFor(() => expect(airi.sent).toHaveLength(1))

    airi.configure({ enabled: 'yes', projectId: 7 })
    airi.configure({ enabled: true, projectId: 'project-1', apiKey: 'test-key' })
    airi.reply(airi.sent[0], 'hi')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(subscribes).toEqual([0])
    expect(disconnects).toBe(0)
  })
})
