import type { IncomingMessage, ServerResponse } from 'node:http'

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { fileURLToPath } from 'node:url'

import { useLogger } from './utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class DebugServer {
  private static instance: DebugServer
  private clients: Set<ServerResponse> = new Set()
  private server: http.Server | null = null

  private constructor() {}

  public static getInstance(): DebugServer {
    if (!DebugServer.instance) {
      DebugServer.instance = new DebugServer()
    }
    return DebugServer.instance
  }

  public start(port = 3000): void {
    if (this.server)
      return

    this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

      if (req.url === '/') {
        // Serve dashboard
        const htmlPath = path.join(__dirname, 'web', 'dashboard.html')
        const html = fs.readFileSync(htmlPath, 'utf-8')
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
      }
      else if (req.url === '/events') {
        // Serve SSE stream
        this.handleSSE(req, res)
      }
      else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    this.server.listen(port, () => {
      useLogger().log(`Debug server running at http://localhost:${port}`)
    })
  }

  public broadcast(type: string, payload: any): void {
    const data = JSON.stringify(payload)
    const message = `event: ${type}\ndata: ${data}\n\n`

    for (const client of this.clients) {
      client.write(message)
    }
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    this.clients.add(res)

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n')
    }, 15000)

    req.on('close', () => {
      clearInterval(keepAlive)
      this.clients.delete(res)
    })
  }
}
