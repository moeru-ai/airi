// Fake OpenAI-compatible server for the in-app test of V1 and V2.
// It streams chat replies with ACT tokens and answers TTS requests with a tone.
// Usage: node fake-openai-server.cjs
// It listens on 127.0.0.1:8091 and logs each request to FAKE_LOG or to the temp folder.
const { Buffer } = require('node:buffer')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')

const logFile = process.env.FAKE_LOG ?? path.join(os.tmpdir(), 'airi-fake-openai-requests.jsonl')
const port = Number(process.env.FAKE_OPENAI_PORT ?? '8091')
const host = process.env.FAKE_OPENAI_HOST ?? '127.0.0.1'
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('FAKE_OPENAI_PORT must be an integer from 1024 to 65535')
  process.exit(1)
}
fs.writeFileSync(logFile, '')

/** The reply for the last user message. The first reply waits 4 s, so the thinking pose shows. */
function replyFor(text) {
  const lower = text.toLowerCase()
  if (lower.includes('triste'))
    return { delay: 1500, content: '<|ACT {"emotion":"sad"}|> Oh no. That is really sad news. I am here with you.' }
  if (lower.includes('pulo'))
    return { delay: 1500, content: '<|ACT {"emotion":"happy","motion":"happy_spin"}|> Look at this, I learned a new move!' }
  return { delay: 4000, content: '<|ACT {"emotion":"happy","motion":"greeting"}|> Hello! It is so nice to see you again. How was your day?' }
}

/** A mono 16 kHz WAV with a tone in syllable bursts, so the lip sync has something to follow. */
function wav(seconds) {
  const rate = 16000
  const samples = Math.floor(rate * seconds)
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const envelope = Math.max(0, Math.sin(2 * Math.PI * 3 * i / rate))
    buffer.writeInt16LE(Math.round(9000 * envelope * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2)
  }
  return buffer
}

function chunk(delta, finishReason = null) {
  const payload = { id: 'fake', object: 'chat.completion.chunk', created: 0, model: 'fake-model', choices: [{ index: 0, delta, finish_reason: finishReason }] }
  return `data: ${JSON.stringify(payload)}\n\n`
}

function streamReply(res, body) {
  let parsed = {}
  try {
    parsed = JSON.parse(body)
  }
  catch {
    parsed = {}
  }
  const users = (parsed.messages ?? []).filter(message => message.role === 'user')
  const last = users.at(-1)
  const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '')
  const { delay, content } = replyFor(text)
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  setTimeout(() => {
    const parts = content.match(/.{1,12}/g)
    let index = 0
    const tick = setInterval(() => {
      if (index < parts.length) {
        res.write(chunk({ role: 'assistant', content: parts[index] }))
        index++
        return
      }
      clearInterval(tick)
      res.write(chunk({}, 'stop'))
      res.end('data: [DONE]\n\n')
    }, 40)
  }, delay)
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  let body = ''
  req.on('data', (part) => {
    body += part
  })
  req.on('end', () => {
    fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), url: req.url, body: body.slice(0, 200000) })}\n`)
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'fake-model', object: 'model' }] }))
      return
    }
    if (req.url.endsWith('/audio/speech')) {
      res.writeHead(200, { 'Content-Type': 'audio/wav' })
      res.end(wav(4))
      return
    }
    if (req.url.endsWith('/chat/completions')) {
      streamReply(res, body)
      return
    }
    res.writeHead(404)
    res.end()
  })
})

server.on('error', (error) => {
  console.error('Fake OpenAI startup failed:', error)
  process.exitCode = 1
})
server.listen(port, host, () => {
  console.info(`fake OpenAI server on ${host}:${port}, log: ${logFile}`)
})
