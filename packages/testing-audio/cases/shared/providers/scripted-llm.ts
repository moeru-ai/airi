import type { AddressInfo } from 'node:net'

import type { ProviderConfiguration } from '../configurations/provider'

import { createServer } from 'node:http'

import { openaiLlm } from './openai'

export interface ScriptedLlmOptions {
  /** The assistant reply. AIRI receives it as the streamed output of the model, so the reply starts the speech output pipeline. */
  reply: string
  /**
   * Characters in one streamed chunk. Small chunks split formulas and tags across chunks, as a real model does.
   * @default 8
   */
  chunkCharacters?: number
}

export interface ScriptedLlm {
  provider: ProviderConfiguration
  /** The body of each chat completion request, in arrival order. */
  requests: unknown[]
  close: () => Promise<void>
}

/**
 * Starts an OpenAI-compatible chat completion endpoint on 127.0.0.1 that streams a fixed reply.
 *
 * A case uses it to test the output side: marker parsing, speech filtering, speech text, chunking, and TTS.
 * The reply does not depend on a model following a prompt, and the case needs no LLM key.
 */
export async function startScriptedLlm(options: ScriptedLlmOptions): Promise<ScriptedLlm> {
  const chunkCharacters = options.chunkCharacters ?? 8
  const requests: unknown[] = []

  const server = createServer((request, response) => {
    // The renderer page has a file:// origin, and the Authorization header makes Chromium send a preflight request.
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }

    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (request.method === 'GET' && path.endsWith('/models')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ object: 'list', data: [{ id: 'scripted', object: 'model', owned_by: 'testing-audio' }] }))
      return
    }

    if (request.method !== 'POST' || !path.endsWith('/chat/completions')) {
      response.writeHead(404).end()
      return
    }

    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => body += chunk)
    request.on('end', () => {
      requests.push(JSON.parse(body))
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })

      const id = `chatcmpl-scripted-${requests.length}`
      const created = Math.floor(Date.now() / 1000)
      const send = (delta: Record<string, string>, finishReason: string | null = null) => response.write(`data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created,
        model: 'scripted',
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      })}\n\n`)

      send({ role: 'assistant', content: '' })
      // Split by code point, so a chunk never ends inside a surrogate pair.
      const characters = [...options.reply]
      for (let index = 0; index < characters.length; index += chunkCharacters)
        send({ content: characters.slice(index, index + chunkCharacters).join('') })
      send({}, 'stop')
      response.end('data: [DONE]\n\n')
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  // The server must not keep the test process alive when a case fails before it closes the server.
  server.unref()
  const { port } = server.address() as AddressInfo

  return {
    provider: openaiLlm({
      apiKey: 'scripted',
      baseUrl: `http://127.0.0.1:${port}/v1/`,
      model: 'scripted',
      provider: 'openai-compatible',
    }),
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}
