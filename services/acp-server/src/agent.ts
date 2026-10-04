import type { AgentContext, ClientCapabilities, SessionUpdate, StopReason } from '@agentclientprotocol/sdk'

import type { AcpBridge, AcpBridgeCapabilities, AcpBridgeStreamEvent, AcpBridgeToolCall } from './bridge'
import type { McpConnection } from './mcp'

import { agent, methods, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk'
import { errorMessageFrom } from '@moeru/std'

import { ACP_CLIENT_DISCONNECTED, AIRI_DESKTOP_NOT_STARTED, connectAcpBridge } from './bridge'
import { callAcpClientTool } from './client-calls'
import { connectMcpServers } from './mcp'
import { promptContent } from './prompt-content'

interface LiveSession {
  client: AgentContext
  capabilities: AcpBridgeCapabilities
  connections: McpConnection[]
  abort?: AbortController
}

export interface AcpAgentOptions {
  /** Replaces the bridge WebSocket. Tests pass a fake bridge. */
  connectBridge?: () => Promise<AcpBridge>
  /** Replaces MCP process launch. */
  connectMcp?: typeof connectMcpServers
}

/** ACP protocol adapter. The desktop application owns the model, the prompt, and the chat session. */
export async function createAcpAgent(options: AcpAgentOptions = {}) {
  const connectBridge = options.connectBridge ?? connectAcpBridge
  const connectMcp = options.connectMcp ?? connectMcpServers
  let clientCapabilities: ClientCapabilities | undefined
  let bridgePromise: Promise<AcpBridge> | undefined
  const sessions = new Map<string, LiveSession>()

  async function bridge() {
    if (!bridgePromise) {
      bridgePromise = connectBridge().catch((error) => {
        bridgePromise = undefined
        throw error
      })
    }
    return bridgePromise
  }

  async function requireBridge() {
    try {
      return await bridge()
    }
    catch (error) {
      throw bridgeFailure(error)
    }
  }

  function capabilities(): AcpBridgeCapabilities {
    return {
      readTextFile: clientCapabilities?.fs?.readTextFile === true,
      writeTextFile: clientCapabilities?.fs?.writeTextFile === true,
      terminal: clientCapabilities?.terminal === true,
      elicitForm: clientCapabilities?.elicitation?.form != null,
    }
  }

  function handlersFor(sessionId: string) {
    return {
      publish: (event: AcpBridgeStreamEvent) => publishStreamEvent(sessionId, event),
      callTool: (call: AcpBridgeToolCall) => {
        const live = sessions.get(sessionId)
        if (!live)
          return Promise.resolve(ACP_CLIENT_DISCONNECTED)
        return callAcpClientTool({
          sessionId,
          client: live.client,
          capabilities: live.capabilities,
          connections: live.connections,
        }, call)
      },
    }
  }

  async function publish(sessionId: string, update: SessionUpdate) {
    const client = sessions.get(sessionId)?.client
    if (!client)
      return
    await client.notify(methods.client.session.update, { sessionId, update })
  }

  async function publishStreamEvent(sessionId: string, event: AcpBridgeStreamEvent) {
    if (event.type === 'user-message') {
      await publish(sessionId, {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: event.text },
      })
      return
    }
    if (event.type === 'text-delta') {
      await publish(sessionId, {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: event.text },
      })
      return
    }
    if (event.type === 'reasoning-delta') {
      await publish(sessionId, {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: event.text },
      })
      return
    }
    if (event.type === 'tool-call') {
      await publish(sessionId, {
        sessionUpdate: 'tool_call',
        toolCallId: event.toolCallId,
        title: event.toolName,
        kind: 'other',
        status: 'pending',
        rawInput: event.args,
      })
      return
    }
    await publish(sessionId, {
      sessionUpdate: 'tool_call_update',
      toolCallId: event.toolCallId,
      status: event.type === 'tool-error' ? 'failed' : 'completed',
      rawOutput: event.result,
      content: [{ type: 'content', content: { type: 'text', text: event.result } }],
    })
  }

  async function closeConnections(connections: McpConnection[]) {
    await Promise.all(connections.map(connection => connection.close()))
  }

  const app = agent({ name: 'airi' })
    .onRequest(methods.agent.initialize, (ctx) => {
      clientCapabilities = ctx.params.clientCapabilities ?? undefined
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentInfo: { name: 'airi', title: 'AIRI', version: '0.12.0-beta.5' },
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { image: true, embeddedContext: true },
          mcpCapabilities: { http: true, sse: true },
        },
      }
    })
    .onRequest(methods.agent.session.new, async (ctx) => {
      const link = await requireBridge()
      const nextCapabilities = capabilities()
      const servers = ctx.params.mcpServers ?? []
      const connections = servers.length > 0 ? await connectMcp(servers, ctx.params.cwd) : []
      try {
        const opened = await link.openSession({
          capabilities: nextCapabilities,
          hasMcp: connections.length > 0,
        })
        const live: LiveSession = {
          client: ctx.client,
          capabilities: nextCapabilities,
          connections,
        }
        sessions.set(opened.chatSessionId, live)
        link.bindSession(opened.chatSessionId, handlersFor(opened.chatSessionId))
        return { sessionId: opened.chatSessionId }
      }
      catch (error) {
        await closeConnections(connections)
        throw bridgeFailure(error)
      }
    })
    .onRequest(methods.agent.session.load, async (ctx) => {
      const link = await requireBridge()
      const nextCapabilities = capabilities()
      const servers = ctx.params.mcpServers ?? []
      const connections = servers.length > 0 ? await connectMcp(servers, ctx.params.cwd) : []
      try {
        const loaded = await link.loadSession({
          chatSessionId: ctx.params.sessionId,
          capabilities: nextCapabilities,
          hasMcp: connections.length > 0,
        })
        const live: LiveSession = {
          client: ctx.client,
          capabilities: nextCapabilities,
          connections,
        }
        sessions.set(ctx.params.sessionId, live)
        link.bindSession(ctx.params.sessionId, handlersFor(ctx.params.sessionId))
        for (const message of loaded.messages) {
          await publish(ctx.params.sessionId, {
            sessionUpdate: message.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
            content: { type: 'text', text: message.text },
          })
        }
        return {}
      }
      catch (error) {
        await closeConnections(connections)
        throw bridgeFailure(error)
      }
    })
    .onRequest(methods.agent.session.prompt, async (ctx) => {
      const link = await requireBridge()
      const live = sessions.get(ctx.params.sessionId)
      if (!live)
        throw RequestError.invalidParams({ sessionId: ctx.params.sessionId }, 'Unknown session')
      live.client = ctx.client
      live.capabilities = capabilities()
      const content = promptContent(ctx.params.prompt)
      const abort = new AbortController()
      live.abort = abort
      const onAbort = () => abort.abort()
      ctx.signal.addEventListener('abort', onAbort, { once: true })
      try {
        const result = await link.prompt({
          chatSessionId: ctx.params.sessionId,
          text: content.text,
          attachments: content.attachments,
          capabilities: live.capabilities,
          hasMcp: live.connections.length > 0,
          signal: abort.signal,
          ...handlersFor(ctx.params.sessionId),
        })
        return { stopReason: result.stopReason satisfies StopReason }
      }
      catch (error) {
        if (abort.signal.aborted)
          return { stopReason: 'cancelled' as const }
        throw bridgeFailure(error)
      }
      finally {
        ctx.signal.removeEventListener('abort', onAbort)
        if (live.abort === abort)
          live.abort = undefined
      }
    })
    .onNotification(methods.agent.session.cancel, (ctx) => {
      sessions.get(ctx.params.sessionId)?.abort?.abort()
    })
    .onRequest(methods.agent.session.close, async (ctx) => {
      const live = sessions.get(ctx.params.sessionId)
      if (!live)
        throw RequestError.invalidParams({ sessionId: ctx.params.sessionId }, 'Unknown session')
      live.abort?.abort()
      sessions.delete(ctx.params.sessionId)
      await closeConnections(live.connections)
      try {
        const link = await bridge()
        link.unbindSession(ctx.params.sessionId)
        await link.closeSession(ctx.params.sessionId)
      }
      catch {
        // The desktop application is already gone. The local ACP session is closed.
      }
      return {}
    })

  return { app }
}

function bridgeFailure(error: unknown) {
  if (error instanceof RequestError)
    return error
  const message = errorMessageFrom(error) ?? AIRI_DESKTOP_NOT_STARTED
  if (message === 'Unknown session' || message === 'ACP session is already connected')
    return RequestError.invalidParams(undefined, message)
  return RequestError.internalError(undefined, message)
}
