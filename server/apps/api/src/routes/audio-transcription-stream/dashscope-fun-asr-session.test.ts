import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'

import { createDashScopeFunAsrStreamResponse, joinSentences } from './dashscope-fun-asr-session'

interface MockFunAsr {
  url: string
  authorization: () => string | undefined
  textFrames: string[]
  binaryFrames: Buffer[]
  close: () => Promise<void>
}

type Behavior = 'success' | 'fail'

async function startMockFunAsr(behavior: Behavior = 'success'): Promise<MockFunAsr> {
  const textFrames: string[] = []
  const binaryFrames: Buffer[] = []
  let authorization: string | undefined
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, request) => {
    authorization = request.headers.authorization
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryFrames.push(Buffer.from(data as Buffer))
        return
      }
      const text = data.toString()
      textFrames.push(text)
      const message = JSON.parse(text) as { header: { action: string, task_id: string } }
      const taskId = message.header.task_id
      if (message.header.action === 'run-task') {
        if (behavior === 'fail') {
          ws.send(JSON.stringify({ header: { event: 'task-failed', task_id: taskId, error_code: 'InvalidParameter', error_message: 'bad model' }, payload: {} }))
          return
        }
        ws.send(JSON.stringify({ header: { event: 'task-started', task_id: taskId }, payload: {} }))
      }
      if (message.header.action === 'finish-task') {
        const sentence = (id: number, text: string, end: boolean, heartbeat = false) => JSON.stringify({
          header: { event: 'result-generated', task_id: taskId },
          payload: { output: { sentence: { sentence_id: id, text, sentence_end: end, heartbeat, begin_time: 100, end_time: end ? 900 : null } } },
        })
        ws.send(sentence(1, '你好', false))
        ws.send(sentence(0, '', false, true))
        ws.send(sentence(1, '你好呀。', true))
        ws.send(sentence(2, '今天', false))
        ws.send(JSON.stringify({ header: { event: 'task-finished', task_id: taskId }, payload: {} }))
      }
    })
  })

  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  return {
    url: `ws://127.0.0.1:${port}`,
    authorization: () => authorization,
    textFrames,
    binaryFrames,
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

function sseEvents(body: string) {
  return body.split('\n\n').filter(Boolean).map(line => JSON.parse(line.replace(/^data: /, '')) as { type: string, text?: string, isFinal?: boolean })
}

describe('createDashScopeFunAsrStreamResponse', () => {
  let upstream: MockFunAsr | undefined

  afterEach(async () => {
    await upstream?.close()
    upstream = undefined
  })

  /**
   * @example
   * createDashScopeFunAsrStreamResponse({ audioStream, credentials })
   */
  it('sends run-task, batches PCM into frames, and returns snapshots of the whole transcript', async () => {
    upstream = await startMockFunAsr()
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(256).fill(1))

    const response = createDashScopeFunAsrStreamResponse({
      audioStream: streamOf(chunks),
      credentials: { apiKey: 'sk-test', model: 'fun-asr-realtime', websocketURL: upstream.url, maxSentenceSilenceMs: 400 },
    })
    const events = sseEvents(await response.text())

    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(upstream.authorization()).toBe('Bearer sk-test')

    const runTask = JSON.parse(upstream.textFrames[0])
    expect(runTask.header).toMatchObject({ action: 'run-task', streaming: 'duplex' })
    expect(runTask.payload).toMatchObject({ model: 'fun-asr-realtime', parameters: { format: 'pcm', sample_rate: 16000, max_sentence_silence: 400 } })
    expect(JSON.parse(upstream.textFrames[1]).header.action).toBe('finish-task')

    // 2560 bytes in 256-byte chunks: one 1792-byte frame at the 1600-byte threshold, then the 768-byte rest.
    expect(upstream.binaryFrames.map(frame => frame.length)).toEqual([1792, 768])

    expect(events).toEqual([
      expect.objectContaining({ type: 'transcript.text.snapshot', text: '你好', isFinal: false }),
      expect.objectContaining({ type: 'transcript.text.snapshot', text: '你好呀。', isFinal: true }),
      expect.objectContaining({ type: 'transcript.text.snapshot', text: '你好呀。\n今天', isFinal: false }),
      { type: 'transcript.text.done', delta: '' },
    ])
  })

  it('errors the response stream when the task fails', async () => {
    upstream = await startMockFunAsr('fail')

    const response = createDashScopeFunAsrStreamResponse({
      audioStream: streamOf([new Uint8Array(320)]),
      credentials: { apiKey: 'sk-test', model: 'bad', websocketURL: upstream.url, maxSentenceSilenceMs: 400 },
    })

    await expect(response.text()).rejects.toThrow('Fun-ASR task failed: InvalidParameter bad model')
  })
})

describe('joinSentences', () => {
  it('orders sentences by id and drops empty ones', () => {
    expect(joinSentences(new Map([[2, ' b '], [1, 'a'], [3, '']]))).toBe('a\nb')
  })
})
