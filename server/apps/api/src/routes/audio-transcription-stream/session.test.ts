import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'

import { createAliyunNlsStreamResponse } from './session'

interface MockAliyunUpstream {
  url: string
  receivedTextFrames: string[]
  receivedBinaryFrames: Buffer[]
  close: () => Promise<void>
}

async function startMockAliyunUpstream(): Promise<MockAliyunUpstream> {
  const receivedTextFrames: string[] = []
  const receivedBinaryFrames: Buffer[] = []
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        receivedBinaryFrames.push(Buffer.from(data as Buffer))
        return
      }

      const text = data.toString()
      receivedTextFrames.push(text)
      const parsed = JSON.parse(text) as { header?: { name?: string } }
      if (parsed.header?.name === 'StartTranscription') {
        ws.send(JSON.stringify({
          header: { name: 'TranscriptionStarted' },
          payload: { session_id: 'mock-session' },
        }))
      }
      if (parsed.header?.name === 'StopTranscription') {
        ws.send(JSON.stringify({
          header: { name: 'SentenceEnd' },
          payload: { result: 'hello airi' },
        }))
        ws.send(JSON.stringify({
          header: { name: 'TranscriptionCompleted' },
        }))
      }
    })
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve)
  })

  const { port } = httpServer.address() as AddressInfo

  return {
    url: `ws://127.0.0.1:${port}`,
    receivedTextFrames,
    receivedBinaryFrames,
    async close() {
      wss.close()
      await new Promise<void>(resolve => httpServer.close(() => resolve()))
    },
  }
}

function streamOf(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function readText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

describe('createAliyunNlsStreamResponse', () => {
  let upstream: MockAliyunUpstream | undefined

  afterEach(async () => {
    await upstream?.close()
    upstream = undefined
  })

  /**
   * @example
   * createAliyunNlsStreamResponse({ audioStream, credentials })
   */
  it('bridges client audio chunks to Aliyun NLS and emits SSE transcript deltas', async () => {
    upstream = await startMockAliyunUpstream()

    const response = createAliyunNlsStreamResponse({
      audioStream: streamOf([Buffer.from([1, 2]), Buffer.from([3, 4])]),
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
    })

    const body = await readText(response.body!)

    expect(body).toContain('data: {"delta":"hello airi\\n","type":"transcript.text.delta"}')
    expect(body).toContain('data: {"delta":"","type":"transcript.text.done"}')
    expect(upstream.receivedBinaryFrames).toEqual([
      Buffer.from([1, 2]),
      Buffer.from([3, 4]),
    ])

    const startFrame = JSON.parse(upstream.receivedTextFrames[0]) as {
      header: { appkey: string, name: string }
      payload: { format: string, sample_rate: number, enable_intermediate_result: boolean }
    }
    expect(startFrame.header.appkey).toBe('app')
    expect(startFrame.header.name).toBe('StartTranscription')
    expect(startFrame.payload.format).toBe('pcm')
    expect(startFrame.payload.sample_rate).toBe(16000)
    expect(startFrame.payload.enable_intermediate_result).toBe(true)

    const stopFrame = JSON.parse(upstream.receivedTextFrames.at(-1)!) as { header: { name: string } }
    expect(stopFrame.header.name).toBe('StopTranscription')
  })
})
