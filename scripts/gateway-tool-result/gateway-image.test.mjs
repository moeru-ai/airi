/* eslint test/no-import-node-test: off -- Keep the external gateway check independent of AIRI dependencies. */
import assert from 'node:assert/strict'
import http from 'node:http'
import process from 'node:process'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, test } from 'node:test'

const source = process.env.GATEWAY_SOURCE
assert.ok(source, 'Set GATEWAY_SOURCE to the external zcgw-server.mjs file.')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII='
const image = () => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } })
function payload(content) {
  return { model: 'fixture-model', messages: [
    { role: 'user', content: 'Read the image returned by the tool.' },
    { role: 'assistant', tool_calls: [{ id: 'call-image', type: 'function', function: { name: 'computer_use_read_image', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call-image', content },
  ] }
}
let root, child, upstream, origin
const calls = []
let mode = 'ok'

before(async () => {
  await mkdir(process.env.TEST_TMPDIR || tmpdir(), { recursive: true })
  root = await mkdtemp(join(process.env.TEST_TMPDIR || tmpdir(), 'gateway-contract-'))
  await copyFile(resolve(source), join(root, 'zcgw-server.mjs'))
  await copyFile(join(dirname(resolve(source)), 'zcgw-fingerprint.mjs'), join(root, 'zcgw-fingerprint.mjs'))
  await writeFile(join(root, 'zcode-profile.json'), JSON.stringify({ system: 'Contract fixture', max_tokens: 2048, thinking: { type: 'disabled' } }))
  const dummyJwt = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ user_id: 'fixture-user' })).toString('base64url')}.fixture`
  await writeFile(join(root, 'accounts.json'), JSON.stringify([{ label: 'fixture', jwt: dummyJwt }]))
  upstream = http.createServer(async (req, res) => {
    let body = ''
    for await (const part of req) body += part
    calls.push(JSON.parse(body))
    res.setHeader('content-type', 'application/json')
    if (mode === 'error') {
      res.writeHead(400)
      res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'fixture model error' } }))
      return
    }
    if (mode === 'bad-envelope') {
      res.end(JSON.stringify({ error: { message: 'fixture malformed response' } }))
      return
    }
    res.end(JSON.stringify({ id: 'fixture-response', type: 'message', content: [{ type: 'text', text: 'fixture visual answer' }], stop_reason: 'end_turn', usage: { input_tokens: 4, output_tokens: 3 } }))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const bootstrap = join(root, 'bootstrap.mjs')
  await writeFile(bootstrap, `import http from 'node:http'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
const listen = http.Server.prototype.listen
http.Server.prototype.listen = function (...args) { this.once('listening', () => process.send({ port: this.address().port })); return listen.apply(this, args) }
await import(pathToFileURL(process.argv[2]).href)
`)
  child = spawn(process.execPath, [bootstrap, join(root, 'zcgw-server.mjs')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', GATEWAY_KEY: 'fixture-only-key', ZCODE_HOME: join(root, 'empty-client'), ZCGW_DATA_DIR: root, ZCODE_UPSTREAM_ORIGIN: `http://127.0.0.1:${upstream.address().port}` },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  let startup = ''
  child.stdout.on('data', (b) => {
    startup += b
  })
  child.stderr.on('data', (b) => {
    startup += b
  })
  const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(([code]) => {
    throw new Error(`Gateway exited ${code}: ${startup}`)
  }), new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gateway startup timeout: ${startup}`)), 10000)
    timer.unref()
  })])
  origin = `http://127.0.0.1:${ready[0].port}`
})

after(async () => {
  if (child && child.exitCode === null) {
    child.kill()
    await once(child, 'exit')
  }
  if (upstream) {
    upstream.closeAllConnections()
    await new Promise(resolve => upstream.close(resolve))
  }
  if (root) {
    assert.ok(resolve(root).startsWith(resolve(process.env.TEST_TMPDIR || tmpdir()) + (process.platform === 'win32' ? '\\' : '/')))
    await rm(root, { recursive: true, force: true })
  }
})

async function request(content) {
  const response = await fetch(`${origin}/v1/chat/completions`, { method: 'POST', headers: { 'authorization': 'Bearer fixture-only-key', 'content-type': 'application/json' }, body: JSON.stringify(payload(content)), signal: AbortSignal.timeout(7000) })
  return { status: response.status, body: await response.json() }
}

test('preserves real AIRI image_url tool output through the HTTP gateway', async () => {
  const result = await request([image()])
  assert.equal(result.status, 200)
  assert.equal(result.body.choices[0].message.content, 'fixture visual answer')
  const block = calls.at(-1).messages.at(-1).content[0]
  assert.equal(block.type, 'tool_result')
  assert.equal(block.tool_use_id, 'call-image')
  assert.deepEqual(block.content, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }])
})

test('preserves ordered mixed text and image blocks', async () => {
  const result = await request([{ type: 'text', text: 'before' }, image(), { type: 'text', text: 'after' }])
  assert.equal(result.status, 200)
  assert.equal(calls.at(-1).messages.at(-1).content[0].content[0].text, 'before')
  assert.equal(calls.at(-1).messages.at(-1).content[0].content[1].type, 'image')
  assert.equal(calls.at(-1).messages.at(-1).content[0].content[2].text, 'after')
})

test('keeps ordinary textual tool errors intact', async () => {
  await request('Tool failed with exit code 1')
  assert.equal(calls.at(-1).messages.at(-1).content[0].content, 'Tool failed with exit code 1')
})

for (const [name, content] of [
  ['missing image_url', [{ type: 'image_url' }]],
  ['empty image array', []],
  ['missing content', undefined],
  ['null content', null],
  ['object content', { type: 'image_url' }],
  ['unknown content part', [{ type: 'video_url', video_url: {} }]],
  ['invalid text', [{ type: 'text', text: 123 }]],
  ['remote image URL', [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }]],
  ['unsupported MIME', [{ type: 'image_url', image_url: { url: 'data:text/html;base64,PHg+' } }]],
  ['MIME signature mismatch', [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${png}` } }]],
  ['invalid base64', [{ type: 'image_url', image_url: { url: 'data:image/png;base64,%%%%' } }]],
  ['empty base64', [{ type: 'image_url', image_url: { url: 'data:image/png;base64,' } }]],
  ['oversized image', [{ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}` } }]],
]) {
  test(`rejects ${name} before an upstream model call`, async () => {
    const beforeCount = calls.length
    const result = await request(content)
    assert.equal(result.status, 400)
    assert.equal(result.body.error.type, 'invalid_request_error')
    assert.match(result.body.error.message, /tool result/i)
    assert.equal(calls.length, beforeCount)
  })
}

test('returns an explicit model error without fabricating an answer', async () => {
  mode = 'error'
  try {
    const result = await request([image()])
    assert.equal(result.status, 400)
    assert.match(result.body.error.message, /fixture model error/)
  }
  finally { mode = 'ok' }
})

test('rejects a malformed successful upstream envelope', async () => {
  mode = 'bad-envelope'
  try {
    const result = await request([image()])
    assert.equal(result.status, 502)
    assert.equal(result.body.error.type, 'api_error')
  }
  finally { mode = 'ok' }
})
