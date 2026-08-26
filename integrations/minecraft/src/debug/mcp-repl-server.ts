import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Brain } from '../cognitive/conscious/brain'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'

import { useLogger } from '../utils/logger'
import { debugEventCategorySchema, debugEventSourceSchema, debugInjectEventSchema, jsonObjectSchema, perceptionSignalSchema } from './types'

export class McpReplServer {
  private readonly mcpServer: McpServer
  private server: null | ReturnType<typeof createServer> = null
  private streamableTransport: null | StreamableHTTPServerTransport = null
  private transport: null | SSEServerTransport = null

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
            mimeType: 'application/json',
            text: JSON.stringify({
              givenUp: snapshot.givenUp,
              paused: snapshot.paused,
              processing: snapshot.isProcessing,
              queueLength: snapshot.queueLength,
              turn: snapshot.turnCounter,
            }, null, 2),
            uri: uri.href,
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
            mimeType: 'text/plain',
            text: snapshot.contextView ?? '(no context view yet)',
            uri: uri.href,
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
            mimeType: 'application/json',
            text: JSON.stringify(snapshot.conversationHistory, null, 2),
            uri: uri.href,
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
            mimeType: 'application/json',
            text: JSON.stringify(snapshot.llmLogEntries.slice(-50), null, 2),
            uri: uri.href,
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
          content: [{ text: JSON.stringify(result, null, 2), type: 'text' }],
        }
      },
    )

    this.mcpServer.tool(
      'inject_chat',
      {
        message: z.string(),
        username: z.string(),
      },
      async ({ message, username }: { message: string, username: string }) => {
        await this.brain.injectDebugEvent({
          payload: {
            confidence: 1.0,
            description: `Chat from ${username}: "${message}"`,
            metadata: {
              message,
              username,
            },
            sourceId: username,
            timestamp: Date.now(),
            type: 'chat_message',
          },
          source: { id: username, type: 'minecraft' },
          timestamp: Date.now(),
          type: 'perception',
        })

        return {
          content: [{ text: `Injected chat from ${username}: "${message}"`, type: 'text' }],
        }
      },
    )

    this.mcpServer.tool(
      'inject_event',
      {
        payload: z.union([perceptionSignalSchema, jsonObjectSchema]),
        source: debugEventSourceSchema,
        type: debugEventCategorySchema,
      },
      async (input: { payload: unknown, source: unknown, type: string }) => {
        const event = debugInjectEventSchema.parse(input)

        await this.brain.injectDebugEvent({
          payload: event.payload,
          source: event.source,
          timestamp: Date.now(),
          type: event.type,
        })

        return {
          content: [{ text: `Injected event: ${event.type}`, type: 'text' }],
        }
      },
    )

    this.mcpServer.tool(
      'get_state',
      {
        includeBuiltins: z.boolean().optional(),
      },
      async ({ includeBuiltins }: { includeBuiltins?: boolean }) => {
        const result = this.brain.getReplState({ includeBuiltins: includeBuiltins ?? false })
        return {
          content: [{ text: JSON.stringify(result), type: 'text' }],
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
            content: [{ text: 'No prompt available yet', type: 'text' }],
            isError: true,
          }
        }
        const {
          messages,
          systemPrompt: _systemPrompt,
          ...rest
        } = result
        const compactMessages = messages.filter(message => message.role !== 'system')
        return {
          content: [{ text: JSON.stringify({
            ...rest,
            messages: compactMessages,
          }), type: 'text' }],
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
          content: [{ text: JSON.stringify(result), type: 'text' }],
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
        return {
          content: [{ text: JSON.stringify(result), type: 'text' }],
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
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

        if (req.method === 'GET' && url.pathname === '/') {
          writeJson(res, 200, {
            endpoints: {
              messages: '/messages',
              sse: '/sse',
            },
            name: 'Minecraft Brain REPL MCP',
            version: '1.0.0',
          })
          return
        }

        if (url.pathname === '/sse' && (req.method === 'POST' || req.method === 'DELETE' || (req.method === 'GET' && typeof req.headers['mcp-session-id'] === 'string'))) {
          const requestBody = req.method === 'POST' ? await readJsonBody(req) : undefined

          if (req.method === 'POST') {
            // Close existing transport before creating a new one (handles client refresh)
            if (this.streamableTransport) {
              await this.streamableTransport.close()
              this.streamableTransport = null
            }

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
              error: { code: -32000, message: 'Bad Request: No valid streamable session initialized' },
              id: null,
              jsonrpc: '2.0',
            })
            return
          }

          await this.streamableTransport.handleRequest(req, res, requestBody)
          return
        }

        if (req.method === 'GET' && url.pathname === '/sse') {
          // Close existing transport before creating a new one (handles client refresh)
          if (this.transport) {
            await this.transport.close()
            this.transport = null
          }

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

    this.server.listen(this.port, '127.0.0.1', () => {
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
