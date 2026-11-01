import { createServer } from 'node:http'

import { WebSocket, WebSocketServer } from 'ws'

async function createBridgeTestServer() {
  const clients = new Set()
  const messages = []
  let connectionCount = 0

  const httpServer = createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'content-type')
    response.setHeader('Cache-Control', 'no-store')

    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }

    const url = new URL(request.url || '/', 'http://127.0.0.1')

    if (request.method === 'GET' && url.pathname === '/state') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        connectionCount,
        openConnectionCount: [...clients].filter(client => client.readyState === WebSocket.OPEN).length,
        messages,
      }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/send') {
      let body = ''
      for await (const chunk of request)
        body += chunk

      try {
        const payload = JSON.stringify(JSON.parse(body))
        let sent = 0
        for (const client of clients) {
          if (client.readyState !== WebSocket.OPEN)
            continue

          client.send(payload)
          sent += 1
        }

        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ sent }))
      }
      catch {
        response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON payload' }))
      }
      return
    }

    response.writeHead(404).end()
  })

  await new Promise((resolve, reject) => {
    const onError = error => reject(error)
    httpServer.once('error', onError)
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', onError)
      resolve()
    })
  })

  const webSocketServer = new WebSocketServer({ server: httpServer })
  webSocketServer.on('connection', (socket) => {
    connectionCount += 1
    clients.add(socket)
    socket.on('message', (raw) => {
      try {
        messages.push(JSON.parse(raw.toString()))
      }
      catch {
        messages.push(raw.toString())
      }
    })
    socket.on('close', () => clients.delete(socket))
  })

  const address = httpServer.address()
  if (!address || typeof address === 'string')
    throw new Error('The WebSocket test server did not bind to a TCP port')

  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const client of clients)
        client.terminate()

      await new Promise(resolve => webSocketServer.close(resolve))
      await new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error)
            reject(error)
          else
            resolve()
        })
      })
    },
  }
}

export default async function setup(project) {
  const servers = []

  try {
    const defaultServer = await createBridgeTestServer()
    servers.push(defaultServer)

    const customServer = await createBridgeTestServer()
    servers.push(customServer)

    project.provide('bridgeTestServers', {
      defaultUrl: defaultServer.url,
      defaultPort: defaultServer.port,
      customUrl: customServer.url,
      customPort: customServer.port,
    })
  }
  catch (error) {
    await Promise.all(servers.map(server => server.close()))
    throw error
  }

  return async () => {
    await Promise.all(servers.map(server => server.close()))
  }
}
