import { ElevenLabsClient } from 'elevenlabs'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { stream } from 'hono/streaming'

const app = new Hono()

app.use(cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['POST', 'HEAD'],
  exposeHeaders: ['Content-Type', 'Transfer-Encoding', 'Content-Length', 'Date', 'Server', 'Connection', 'X-Powered-By', 'X-Request-ID'],
  maxAge: 60 * 60 * 24 * 30, // 30 days
}))

app.post('/api/v1/llm/voice/elevenlabs', async (c) => {
  return stream(c, async (stream) => {
    const body = await c.req.json()
    const apiKeyUnknown = c.req.header('Authorization')

    let apiKey = apiKeyUnknown?.trim().substring('Bearer '.length)
    const { ELEVENLABS_API_KEY } = env<{ ELEVENLABS_API_KEY?: string }>(c)
    if (!apiKey && !!ELEVENLABS_API_KEY) {
      apiKey = ELEVENLABS_API_KEY
    }

    const client = new ElevenLabsClient({ apiKey })

    const res = await client.generate(body)

    // Set headers for streaming
    c.res.headers.append('Content-Type', 'audio/mpeg')
    c.res.headers.append('Transfer-Encoding', 'chunked')

    // Stream the response
    await stream.pipe(new ReadableStream({
      async pull(controller) {
        for await (const chunk of res as unknown as Uint8Array) {
          controller.enqueue(chunk)
        }

        controller.close()
      },
    }))
  })
})

export default app
