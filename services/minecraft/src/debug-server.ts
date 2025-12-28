import type { IncomingMessage, ServerResponse } from 'node:http'

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'

import { fileURLToPath } from 'node:url'

import { useLogger } from './utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface DebugEvent {
  type: string
  payload: any
  timestamp: number
}

export class DebugService {
  private static instance: DebugService
  private clients: Set<ServerResponse> = new Set()
  private server: http.Server | null = null

  // History buffer (Ring buffer)
  private history: DebugEvent[] = []
  private readonly MAX_HISTORY = 1000

  // File Logging
  private logStream: fs.WriteStream | null = null

  private constructor() {
    this.initLogFile()
  }

  public static getInstance(): DebugService {
    if (!DebugService.instance) {
      DebugService.instance = new DebugService()
    }
    return DebugService.instance
  }

  private initLogFile() {
    const logsDir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    const filename = `session-${new Date().toISOString().replace(/:/g, '-')}.jsonl`
    this.logStream = fs.createWriteStream(path.join(logsDir, filename), { flags: 'a' })
  }

  public start(port = 3000): void {
    if (this.server)
      return

    this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

      if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
      }

      if (req.url === '/') {
        // Serve dashboard
        const htmlPath = path.join(__dirname, 'web', 'dashboard.html')
        try {
          const html = fs.readFileSync(htmlPath, 'utf-8')
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          })
          res.end(html)
        }
        catch {
          res.writeHead(500)
          res.end('Dashboard not found')
        }
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

  // --- Public API for Brain/Agents ---

  public log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, fields?: any) {
    this.emit('log', { level, message, fields, timestamp: Date.now() })
  }

  public traceLLM(trace: any) {
    this.emit('llm', { ...trace, timestamp: Date.now() })
  }

  public updateBlackboard(state: any) {
    this.emit('blackboard', { state, timestamp: Date.now() })
  }

  public updateQueue(queue: any[], processing?: any) {
    this.emit('queue', { queue, processing, timestamp: Date.now() })
  }

  // Generic emit
  public emit(type: string, payload: any): void {
    const event: DebugEvent = {
      type,
      payload,
      timestamp: Date.now(),
    }

    // 1. Add to Histroy
    this.addToHistory(event)

    // 2. Persist to Disk
    this.persistEvent(event)

    // 3. Broadcast to Clients
    this.broadcast(event)
  }

  // --- Internal Logic ---

  private addToHistory(event: DebugEvent) {
    this.history.push(event)
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift()
    }
  }

  private persistEvent(event: DebugEvent) {
    if (this.logStream) {
      try {
        this.logStream.write(`${JSON.stringify(event)}\n`)
      }
      catch (err) {
        console.error('Failed to write to log file', err)
      }
    }
  }

  private broadcast(event: DebugEvent): void {
    // Safe stringify to handle circular refs if any (basic protection)
    let data = ''
    try {
      data = JSON.stringify(event.payload)
    }
    catch {
      data = JSON.stringify({ error: 'Circular Reference or Serialization Error' })
    }

    const message = `event: ${event.type}\ndata: ${data}\n\n`

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

    // Send history immediately on connection
    for (const event of this.history) {
      let data = ''
      try {
        data = JSON.stringify(event.payload)
      }
      catch {
        continue
      }
      res.write(`event: ${event.type}\ndata: ${data}\n\n`)
    }

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
