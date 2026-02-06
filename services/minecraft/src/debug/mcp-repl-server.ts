import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Brain } from '../cognitive/conscious/brain'

import { createServer } from 'node:http'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { useLogger } from '../utils/logger'

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw)
    return null
  return JSON.parse(raw)
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

export class McpReplServer {
  private server: ReturnType<typeof createServer> | null = null
  private transport: SSEServerTransport | null = null
  private streamableTransport: StreamableHTTPServerTransport | null = null
  private readonly mcpServer: McpServer

  constructor(private readonly brain: Brain, private readonly port: number = 3001) {
    this.mcpServer = new McpServer({
      name: 'Minecraft Brain REPL',
      version: '1.0.0',
    })

    // --- Resources ---

    this.mcpServer.resource(
      'brain-state',
      new ResourceTemplate('brain://state', { list: undefined }),
      async (uri: any) => {
        const snapshot = this.brain.getDebugSnapshot()
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              processing: snapshot.isProcessing,
              queueLength: snapshot.queueLength,
              turn: snapshot.turnCounter,
              giveUpUntil: snapshot.giveUpUntil,
            }, null, 2),
            mimeType: 'application/json',
          }],
        }
      },
    )

    this.mcpServer.resource(
      'brain-context',
      new ResourceTemplate('brain://context', { list: undefined }),
      async (uri: any) => {
        const snapshot = this.brain.getDebugSnapshot()
        return {
          contents: [{
            uri: uri.href,
            text: snapshot.contextView ?? '(no context view yet)',
            mimeType: 'text/plain',
          }],
        }
      },
    )

    this.mcpServer.resource(
      'brain-history',
      new ResourceTemplate('brain://history', { list: undefined }),
      async (uri: any) => {
        const snapshot = this.brain.getDebugSnapshot()
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(snapshot.conversationHistory, null, 2),
            mimeType: 'application/json',
          }],
        }
      },
    )

    this.mcpServer.resource(
      'brain-logs',
      new ResourceTemplate('brain://logs', { list: undefined }),
      async (uri: any) => {
        const snapshot = this.brain.getDebugSnapshot()
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify(snapshot.llmLogEntries.slice(-50), null, 2),
            mimeType: 'application/json',
          }],
        }
      },
    )

    // --- Tools ---

    this.mcpServer.tool(
      'execute_repl',
      {
        code: z.string(),
      },
      async ({ code }: { code: string }) => {
        const result = await this.brain.executeDebugRepl(code)
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      },
    )

    this.mcpServer.tool(
      'inject_chat',
      {
        username: z.string(),
        message: z.string(),
      },
      async ({ username, message }: { username: string, message: string }) => {
        await this.brain.injectDebugEvent({
          type: 'perception',
          payload: {
            type: 'chat_message',
            description: `Chat from ${username}: "${message}"`,
            sourceId: username,
            confidence: 1.0,
            timestamp: Date.now(),
            metadata: {
              username,
              message,
            },
          },
          source: { type: 'minecraft', id: username },
          timestamp: Date.now(),
        })

        return {
          content: [{ type: 'text', text: `Injected chat from ${username}: "${message}"` }],
        }
      },
    )

    this.mcpServer.tool(
      'inject_event',
      {
        type: z.enum(['perception', 'feedback', 'world_update', 'system_alert']),
        payload: z.any(),
        source: z.object({
          type: z.enum(['minecraft', 'airi', 'system']),
          id: z.string(),
        }),
      },
      async ({ type, payload, source }: { type: any, payload: any, source: any }) => {
        await this.brain.injectDebugEvent({
          type,
          payload,
          source,
          timestamp: Date.now(),
        })

        return {
          content: [{ type: 'text', text: `Injected event: ${type}` }],
        }
      },
    )

    this.mcpServer.tool(
      'get_state',
      {},
      async () => {
        const result = this.brain.getReplState()
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }
      },
    )

    this.mcpServer.tool(
      'get_last_prompt',
      {},
      async () => {
        const result = this.brain.getLastLlmInput()
        if (!result) {
          return {
            content: [{ type: 'text', text: 'No prompt available yet' }],
            isError: true,
          }
        }
        const {
          systemPrompt: _systemPrompt,
          messages,
          ...rest
        } = result
        const compactMessages = messages.filter(message => message.role !== 'system')
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ...rest,
            messages: compactMessages,
          }) }],
        }
      },
    )

    this.mcpServer.tool(
      'get_logs',
      {
        limit: z.number().optional(),
      },
      async ({ limit }) => {
        const result = this.brain.getLlmLogs(limit)
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }
      },
    )

    this.mcpServer.tool(
      'get_llm_trace',
      {
        limit: z.number().optional(),
        turnId: z.number().optional(),
      },
      async ({ limit, turnId }) => {
        const result = this.brain
          .getLlmTrace(limit, turnId)
          .map(entry => ({
            ...entry,
            messages: entry.messages.filter(message => message.role !== 'system'),
          }))
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        }
      },
    )
  }

  start(): void {
    if (this.server)
      return

    const logger = useLogger()

    this.server = createServer(async (req, res) => {
      try {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id, Last-Event-ID')
        res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

        if (req.method === 'GET' && url.pathname === '/') {
          writeJson(res, 200, {
            name: 'Minecraft Brain REPL MCP',
            version: '1.0.0',
            endpoints: {
              sse: '/sse',
              messages: '/messages',
            },
          })
          return
        }

        if (url.pathname === '/sse' && (req.method === 'POST' || req.method === 'DELETE' || (req.method === 'GET' && typeof req.headers['mcp-session-id'] === 'string'))) {
          const requestBody = req.method === 'POST' ? await readJsonBody(req) : undefined

          if (req.method === 'POST' && !this.streamableTransport) {
            const streamableTransport = new StreamableHTTPServerTransport({
              // Stateless mode keeps compatibility with clients that don't preserve mcp-session-id.
              sessionIdGenerator: undefined,
            })
            streamableTransport.onclose = () => {
              if (this.streamableTransport === streamableTransport)
                this.streamableTransport = null
            }

            this.streamableTransport = streamableTransport
            await this.mcpServer.connect(streamableTransport)
          }

          if (!this.streamableTransport) {
            writeJson(res, 400, {
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Bad Request: No valid streamable session initialized' },
              id: null,
            })
            return
          }

          await this.streamableTransport.handleRequest(req, res, requestBody)
          return
        }

        if (req.method === 'GET' && url.pathname === '/sse') {
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')

          const transport = new SSEServerTransport('/messages', res)
          this.transport = transport

          req.on('close', () => {
            if (this.transport === transport)
              this.transport = null
          })

          await this.mcpServer.connect(transport)
          return
        }

        if (req.method === 'POST' && url.pathname === '/messages') {
          if (!this.transport) {
            writeJson(res, 503, { error: 'No active SSE connection' })
            return
          }

          const body = await readJsonBody(req)
          const response = await this.transport.handleMessage(body)
          writeJson(res, 200, response ?? null)
          return
        }

        writeJson(res, 404, { error: 'Not found' })
      }
      catch (error) {
        logger.errorWithError('MCP REPL server request failed', error)
        writeJson(res, 500, { error: 'Internal server error' })
      }
    })

    this.server.listen(this.port, () => {
      logger.log(`MCP REPL server running at http://localhost:${this.port}`)
    })
  }

  stop(): void {
    if (!this.server)
      return

    this.transport = null
    if (this.streamableTransport) {
      void this.streamableTransport.close()
      this.streamableTransport = null
    }

    this.server.close()
    this.server = null
  }
}
