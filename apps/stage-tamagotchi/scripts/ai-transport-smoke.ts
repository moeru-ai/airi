import type { AddressInfo } from 'node:net'

import assert from 'node:assert/strict'

import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app, BrowserWindow } from 'electron'

import { fetchAI, setupAITransport } from '../src/main/services/electron/ai-transport'

app.on('window-all-closed', () => {})

/**
 * Runs real Electron IPC against a loopback upstream that sends no CORS permission headers.
 * Call stack: Electron -> run -> setupAITransport -> RequestSession -> net.request.
 */
async function run() {
  const directory = await mkdtemp(join(tmpdir(), 'airi-ai-transport-'))
  app.setPath('userData', directory)
  const submissions = new Map<string, number>()
  let active = 0
  const upstream = createServer(async (incoming, outgoing) => {
    const path = incoming.url ?? '/'
    submissions.set(path, (submissions.get(path) ?? 0) + 1)
    active++
    outgoing.once('close', () => {
      active--
    })
    if (path === '/slow') {
      outgoing.writeHead(200, { 'content-type': 'text/event-stream' })
      outgoing.write('data: first\n\n')
      const timer = setTimeout(() => outgoing.end('data: last\n\n'), 10_000)
      outgoing.once('close', () => clearTimeout(timer))
      return
    }
    if (path === '/pending')
      return
    if (path === '/redirect') {
      outgoing.writeHead(302, { location: '/binary' })
      outgoing.end()
      return
    }
    if (path.startsWith('/hop?')) {
      const parameters = new URL(path, 'http://localhost').searchParams
      incoming.resume()
      outgoing.writeHead(Number(parameters.get('status') ?? 302), { location: parameters.get('to')! })
      outgoing.end()
      return
    }
    if (path === '/echo') {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming)
        chunks.push(chunk)
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ method: incoming.method, headers: incoming.headers, body: Buffer.concat(chunks).toString() }))
      return
    }
    if (path === '/upload') {
      const chunks: Uint8Array[] = []
      for await (const chunk of incoming)
        chunks.push(chunk)
      const request = new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'content-type': incoming.headers['content-type']! },
        body: Buffer.concat(chunks),
      })
      const form = await request.formData()
      const file = form.get('file') as File
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ model: form.get('model'), name: file.name, bytes: [...new Uint8Array(await file.arrayBuffer())] }))
      return
    }
    if (path.startsWith('/status/')) {
      outgoing.statusCode = Number(path.split('/').at(-1))
      outgoing.end('upstream error')
      return
    }
    if (path === '/v1/models') {
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ data: [{ id: 'test-model', object: 'model' }] }))
      return
    }
    if (path === '/v1/chat/completions') {
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'hello from proxy' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
      return
    }
    if (path === '/v1/images/generations') {
      outgoing.setHeader('content-type', 'application/json')
      outgoing.end(JSON.stringify({ url: `http://${incoming.headers.host}/image-result` }))
      return
    }
    outgoing.end(Buffer.from([0, 127, 128, 255]))
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  const pageServer = createServer((_incoming, outgoing) => {
    outgoing.setHeader('content-type', 'text/html')
    if (_incoming.url === '/credentials') {
      outgoing.end(JSON.stringify(_incoming.headers))
      return
    }
    outgoing.end('<title>AIRI transport test</title>')
  })
  await new Promise<void>(resolve => pageServer.listen(0, '127.0.0.1', resolve))
  const page = `http://127.0.0.1:${(pageServer.address() as AddressInfo).port}`
  const windows: BrowserWindow[] = []
  try {
    await app.whenReady()
    for (let index = 0; index < 2; index++) {
      const window = new BrowserWindow({ show: false, webPreferences: { preload: join(__dirname, 'ai-transport-smoke-preload.cjs'), sandbox: false, contextIsolation: true } })
      setupAITransport(window)
      windows.push(window)
      await window.loadURL(page)
    }
    const [first, second] = windows
    const evaluate = (window: BrowserWindow, expression: string) => window.webContents.executeJavaScript(`window.aiTransportSmoke.${expression}`)
    await assert.rejects(first.webContents.executeJavaScript(`fetch(${JSON.stringify(`${base}/direct`)})`))
    await assert.rejects(evaluate(first, `request(${JSON.stringify(`${base}/disabled`)})`))
    assert.equal(await evaluate(first, 'setEnabled(true)'), true)
    assert.equal(await evaluate(second, 'enabled()'), true)
    assert.deepEqual(await evaluate(first, `request(${JSON.stringify(`${base}/redirect`)})`), { status: 200, bytes: [0, 127, 128, 255] })
    const hop = (status: number, to: string) => `${base}/hop?${new URLSearchParams({ status: String(status), to })}`
    for (const status of [301, 302, 303, 307, 308]) {
      const response = await fetchAI(hop(status, '/echo'), {
        method: 'POST',
        body: 'original body',
        headers: { 'authorization': 'Bearer test', 'content-type': 'text/plain' },
      })
      assert.equal(response.url, `${base}/echo`)
      assert.equal(response.redirected, true)
      const echoed = await response.json()
      assert.equal(echoed.method, status >= 307 ? 'POST' : 'GET')
      assert.equal(echoed.body, status >= 307 ? 'original body' : '')
      assert.equal(echoed.headers.authorization, 'Bearer test')
    }
    const credentials = await (await fetchAI(hop(302, `${page}/credentials`), {
      headers: { 'authorization': 'Bearer private', 'x-api-key': 'private', 'cookie': 'private', 'origin': base, 'referer': base, 'accept': 'application/json' },
    })).json()
    for (const name of ['authorization', 'x-api-key', 'cookie', 'origin', 'referer'])
      assert.equal(credentials[name], undefined)
    assert.equal(credentials.accept, 'application/json')
    const manual = await fetchAI(hop(302, '/never-followed'), { redirect: 'manual' })
    assert.equal(manual.status, 302)
    assert.equal(manual.headers.get('location'), '/never-followed')
    assert.equal(manual.redirected, false)
    await assert.rejects(fetchAI(hop(302, '/never-followed'), { redirect: 'error' }))
    assert.equal(submissions.get('/never-followed'), undefined)
    await assert.rejects(fetchAI(hop(302, 'file:///private')))
    const redirectedStream = await evaluate(first, `stream(${JSON.stringify(hop(307, '/slow'))})`)
    assert.equal(redirectedStream.text, 'data: first\n\n')
    assert.ok(redirectedStream.elapsed < 2000)
    assert.deepEqual(await evaluate(first, `inference(${JSON.stringify(`${base}/v1/`)})`), {
      text: 'hello from proxy',
      model: 'test-model',
      audio: [0, 127, 128, 255],
      image: [0, 127, 128, 255],
    })
    assert.deepEqual(await evaluate(first, `multipart(${JSON.stringify(`${base}/upload`)})`), { model: 'transcription', name: 'voice.wav', bytes: [0, 127, 128, 255] })
    for (const status of [401, 429, 500]) {
      const result = await evaluate(first, `request(${JSON.stringify(`${base}/status/${status}`)})`)
      assert.equal(result.status, status)
      assert.equal(new TextDecoder().decode(new Uint8Array(result.bytes)), 'upstream error')
      assert.equal(submissions.get(`/status/${status}`), 1)
    }
    const stream = await evaluate(first, `stream(${JSON.stringify(`${base}/slow`)})`)
    assert.equal(stream.text, 'data: first\n\n')
    assert.ok(stream.elapsed < 2000)
    assert.equal(await evaluate(first, `abort(${JSON.stringify(`${base}/pending`)})`), true)
    await evaluate(first, `start(${JSON.stringify({ id: 'isolated', url: `${base}/slow`, method: 'GET', headers: [], redirect: 'follow' })})`)
    await assert.rejects(evaluate(second, 'read("isolated")'))
    await evaluate(second, 'cancel("isolated")')
    assert.ok(await evaluate(first, 'read("isolated")'))
    await evaluate(first, 'setEnabled(false)')
    await evaluate(first, 'cancel("isolated")')
    await assert.rejects(evaluate(first, `request(${JSON.stringify(`${base}/disabled-again`)})`))
    await evaluate(first, 'setEnabled(true)')
    await assert.rejects(evaluate(first, 'start({ id: "file", url: "file:///private", method: "GET", headers: [], redirect: "follow" })'))
    await evaluate(first, `start(${JSON.stringify({ id: 'closing', url: `${base}/slow`, method: 'GET', headers: [], redirect: 'follow' })})`)
    first.destroy()
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(active, 0)
    console.info('PASS: redirects, credential isolation, CORS, binary, multipart, SSE, status preservation, no retries, abort, caller isolation, toggle, protocol restriction, window cleanup')
  }
  catch (error) {
    await writeFile(join(__dirname, 'result.json'), JSON.stringify({ passed: false, error: String(error) }))
    throw error
  }
  finally {
    for (const window of windows) {
      if (!window.isDestroyed())
        window.destroy()
    }
    upstream.closeAllConnections()
    pageServer.closeAllConnections()
    await new Promise<void>(resolve => pageServer.close(() => resolve()))
    await new Promise<void>(resolve => upstream.close(() => resolve()))
    // The temporary profile belongs exclusively to this smoke run.
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

void run().then(async () => {
  await writeFile(join(__dirname, 'result.json'), JSON.stringify({ passed: true }))
  app.exit(0)
}, async (error) => {
  console.error(error)
  await writeFile(join(__dirname, 'result.json'), JSON.stringify({ passed: false, error: String(error), stack: error.stack }))
  app.exit(1)
})
