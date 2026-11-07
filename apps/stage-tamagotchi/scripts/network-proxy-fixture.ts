import type { AddressInfo, Socket } from 'node:net'

import type { BrowserWindow } from 'electron'

import assert from 'node:assert/strict'

import { Buffer } from 'node:buffer'
import { createServer as createHTTPServer, request } from 'node:http'
import { connect, createServer } from 'node:net'

import nodeAdapter from 'crossws/adapters/node'

import { fetchAI } from '../src/main/services/electron/ai-transport'

/**
 * Exercises Chromium routing without external services or DNS.
 * Call stack: Electron fixture -> verifyNetworkProxy -> HTTP/SOCKS5 proxy -> loopback upstream.
 */
export async function verifyNetworkProxy(first: BrowserWindow, second: BrowserWindow): Promise<void> {
  const sockets = new Set<Socket>()
  const track = (socket: Socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const upstream = createHTTPServer((_incoming, outgoing) => {
    outgoing.setHeader('access-control-allow-origin', '*')
    outgoing.setHeader('connection', 'close')
    outgoing.end('network proxy fixture')
  })
  upstream.on('connection', track)
  const websocket = nodeAdapter({
    hooks: {
      message: (peer, message) => {
        peer.send(message.uint8Array())
      },
    },
  })
  upstream.on('upgrade', websocket.handleUpgrade)
  let httpRequests = 0
  let socksConnections = 0
  const http = createHTTPServer((incoming, outgoing) => {
    httpRequests++
    const target = new URL(incoming.url!)
    const forwarded = request({ host: '127.0.0.1', port: target.port, path: target.pathname, method: incoming.method, headers: incoming.headers }, (response) => {
      outgoing.writeHead(response.statusCode!, response.headers)
      response.pipe(outgoing)
    })
    forwarded.on('error', () => outgoing.destroy())
    incoming.pipe(forwarded)
  })
  http.on('connection', track)
  http.on('connect', (incoming, client, head) => {
    httpRequests++
    const target = new URL(`http://${incoming.url}`)
    const remote = connect(Number(target.port), '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      remote.write(head)
      client.pipe(remote).pipe(client)
    })
    track(remote)
    client.on('close', () => remote.destroy())
  })
  const socks = createServer((client) => {
    track(client)
    let buffer = Buffer.alloc(0)
    let greeted = false
    // The fixture accepts unauthenticated SOCKS5 CONNECT for domain names and IPv4.
    // Frames can span TCP chunks. Once connected, the socket forwards bytes without parsing them.
    const receive = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (!greeted) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1])
          return
        buffer = buffer.subarray(2 + buffer[1])
        client.write(Buffer.from([5, 0]))
        greeted = true
      }
      if (buffer.length < 5)
        return
      const addressLength = buffer[3] === 3 ? 1 + buffer[4] : 4
      const length = 4 + addressLength + 2
      if (buffer.length < length)
        return
      client.off('data', receive)
      client.pause()
      socksConnections++
      const port = buffer.readUInt16BE(length - 2)
      const rest = buffer.subarray(length)
      const remote = connect(port, '127.0.0.1', () => {
        client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
        remote.write(rest)
        client.pipe(remote).pipe(client)
        client.resume()
      })
      track(remote)
      client.on('close', () => remote.destroy())
    }
    client.on('data', receive)
  })
  const servers = [upstream, http, socks]
  try {
    for (const server of servers)
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server: typeof http | typeof socks) => (server.address() as AddressInfo).port
    const url = `http://airi-proxy.invalid:${port(upstream)}/network`
    const set = (address: string) => first.webContents.executeJavaScript(`window.aiTransportSmoke.networkSet(${JSON.stringify({ mode: 'custom', address, bypassRules: '' })})`)
    const browserFetch = () => first.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(response => response.text())`)
    const openSocket = (name: string) => first.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const socket = new WebSocket(${JSON.stringify(url.replace('http:', 'ws:'))});
      window[${JSON.stringify(name)}] = socket;
      socket.onopen = () => resolve(true);
      socket.onerror = () => reject(new Error('WebSocket failed'));
    })`)
    const echo = (name: string) => first.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const socket = window[${JSON.stringify(name)}];
      socket.binaryType = 'arraybuffer';
      const timer = setTimeout(() => reject(new Error('WebSocket echo timed out')), 5000);
      socket.onmessage = event => { clearTimeout(timer); resolve(new TextDecoder().decode(event.data)); };
      socket.send('still connected');
    })`)

    await set(`http://127.0.0.1:${port(http)}`)
    assert.equal((await second.webContents.executeJavaScript('window.aiTransportSmoke.networkGet()')).config.mode, 'custom')
    assert.equal(await browserFetch(), 'network proxy fixture')
    assert.equal(await (await fetchAI(url)).text(), 'network proxy fixture')
    await openSocket('oldSocket')
    assert.ok(httpRequests >= 3)
    const previousHTTPRequests = httpRequests

    await set(`socks5://127.0.0.1:${port(socks)}`)
    assert.equal(await echo('oldSocket'), 'still connected')
    assert.equal(await browserFetch(), 'network proxy fixture')
    assert.equal(await (await fetchAI(url)).text(), 'network proxy fixture')
    await openSocket('newSocket')
    assert.equal(await echo('newSocket'), 'still connected')
    assert.ok(socksConnections >= 3)
    assert.equal(httpRequests, previousHTTPRequests)

    await set('http://127.0.0.1:1')
    await assert.rejects(browserFetch())
    await assert.rejects(fetchAI(url))
    assert.equal(await echo('oldSocket'), 'still connected')
    const localURL = `http://127.0.0.1:${port(upstream)}/network`
    assert.equal(await first.webContents.executeJavaScript(`fetch(${JSON.stringify(localURL)}).then(response => response.text())`), 'network proxy fixture')
    await first.webContents.executeJavaScript('window.oldSocket.close(); window.newSocket.close()')
  }
  finally {
    await first.webContents.executeJavaScript('window.aiTransportSmoke.networkSet({ mode: "system", address: "", bypassRules: "" })')
    for (const socket of sockets)
      socket.destroy()
    websocket.closeAll()
    for (const server of servers)
      await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
