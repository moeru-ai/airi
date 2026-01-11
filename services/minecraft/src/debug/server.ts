import type { IncomingMessage } from 'node:http'

import type { WebSocket } from 'ws'

import type { ClientCommand, DebugMessage, ServerEvent } from './types'

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'

import { fileURLToPath } from 'node:url'

import { WebSocketServer } from 'ws'

import { useLogger } from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface ClientInfo {
  ws: WebSocket
  id: string
  connectedAt: number
  lastPing: number
}

type CommandHandler = (command: ClientCommand, client: ClientInfo) => void

export class DebugServer {
  private httpServer: http.Server | null = null
  private wss: WebSocketServer | null = null
  private clients: Map<string, ClientInfo> = new Map()
  private commandHandlers: Map<string, CommandHandler[]> = new Map()

  // History buffer (Ring buffer)
  private history: ServerEvent[] = []
  private readonly MAX_HISTORY = 1000

  // File Logging
  private logStream: fs.WriteStream | null = null

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private readonly HEARTBEAT_INTERVAL = 30000

  private messageIdCounter = 0

  constructor() {
    this.initLogFile()
  }

  private initLogFile(): void {
    const logsDir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    const filename = `session-${new Date().toISOString().replace(/:/g, '-')}.jsonl`
    this.logStream = fs.createWriteStream(path.join(logsDir, filename), { flags: 'a' })
  }

  public start(port = 3000): void {
    if (this.httpServer) {
      return
    }

    // Create HTTP server for static files
    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res)
    })

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer })

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req)
    })

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat()
    }, this.HEARTBEAT_INTERVAL)

    this.httpServer.listen(port, () => {
      useLogger().log(`Debug server running at http://localhost:${port}`)
    })
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    for (const client of this.clients.values()) {
      client.ws.close()
    }
    this.clients.clear()

    this.wss?.close()
    this.wss = null

    this.httpServer?.close()
    this.httpServer = null

    this.logStream?.end()
    this.logStream = null
  }

  // ============================================================
  // Public API for emitting events
  // ============================================================

  public broadcast(event: ServerEvent): void {
    // Add to history
    this.addToHistory(event)

    // Persist to disk
    this.persistEvent(event)

    // Send to all connected clients
    const message = this.createMessage(event)
    const data = JSON.stringify(message)

    for (const client of this.clients.values()) {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(data)
      }
    }
  }

  // ============================================================
  // Command handling
  // ============================================================

  public onCommand(type: string, handler: CommandHandler): () => void {
    const handlers = this.commandHandlers.get(type) || []
    handlers.push(handler)
    this.commandHandlers.set(type, handlers)

    // Return unsubscribe function
    return () => {
      const h = this.commandHandlers.get(type)
      if (h) {
        const idx = h.indexOf(handler)
        if (idx !== -1) {
          h.splice(idx, 1)
        }
      }
    }
  }

  // ============================================================
  // Private methods
  // ============================================================

  private handleHttpRequest(req: IncomingMessage, res: http.ServerResponse): void {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    // Serve static files from web directory
    let filePath = req.url === '/' ? '/index.html' : req.url || '/index.html'

    // Security: prevent directory traversal
    filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '')

    const fullPath = path.join(__dirname, 'web', filePath)
    const extname = path.extname(fullPath).toLowerCase()

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }

    const contentType = mimeTypes[extname] || 'application/octet-stream'

    fs.readFile(fullPath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404)
          res.end('Not Found')
        }
        else {
          res.writeHead(500)
          res.end('Server Error')
        }
        return
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      })
      res.end(content)
    })
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const clientId = this.generateClientId()
    const client: ClientInfo = {
      ws,
      id: clientId,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    }

    this.clients.set(clientId, client)

    // Send history on connect
    this.sendHistory(client)

    ws.on('message', (data) => {
      this.handleMessage(client, data.toString())
    })

    ws.on('close', () => {
      this.clients.delete(clientId)
    })

    ws.on('error', (err) => {
      console.error(`WebSocket error for client ${clientId}:`, err)
      this.clients.delete(clientId)
    })
  }

  private handleMessage(client: ClientInfo, data: string): void {
    try {
      const message = JSON.parse(data) as DebugMessage<ClientCommand>
      const command = message.data

      // Handle ping internally
      if (command.type === 'ping') {
        client.lastPing = Date.now()
        const pong: ServerEvent = { type: 'pong', payload: { timestamp: Date.now() } }
        client.ws.send(JSON.stringify(this.createMessage(pong)))
        return
      }

      // Handle history request
      if (command.type === 'request_history') {
        this.sendHistory(client)
        return
      }

      // Dispatch to registered handlers
      const handlers = this.commandHandlers.get(command.type)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(command, client)
          }
          catch (err) {
            console.error(`Command handler error for ${command.type}:`, err)
          }
        }
      }
    }
    catch (err) {
      console.error('Failed to parse WebSocket message:', err)
    }
  }

  private sendHistory(client: ClientInfo): void {
    if (this.history.length === 0) {
      return
    }

    const historyEvent: ServerEvent = {
      type: 'history',
      payload: this.history,
    }

    client.ws.send(JSON.stringify(this.createMessage(historyEvent)))
  }

  private sendHeartbeat(): void {
    const now = Date.now()
    for (const [clientId, client] of this.clients) {
      // Check if client is still alive (responded to ping within 2x heartbeat interval)
      if (now - client.lastPing > this.HEARTBEAT_INTERVAL * 2) {
        client.ws.close()
        this.clients.delete(clientId)
        continue
      }

      // Send ping request
      if (client.ws.readyState === 1) {
        const ping: ServerEvent = { type: 'pong', payload: { timestamp: now } }
        client.ws.send(JSON.stringify(this.createMessage(ping)))
      }
    }
  }

  private addToHistory(event: ServerEvent): void {
    this.history.push(event)
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
    }
  }

  private persistEvent(event: ServerEvent): void {
    if (this.logStream) {
      try {
        this.logStream.write(`${JSON.stringify(event)}\n`)
      }
      catch (err) {
        console.error('Failed to write to log file', err)
      }
    }
  }

  private createMessage(event: ServerEvent): DebugMessage<ServerEvent> {
    return {
      id: `${++this.messageIdCounter}`,
      data: event,
      timestamp: Date.now(),
    }
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }
}
