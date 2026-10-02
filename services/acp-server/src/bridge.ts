import { defineInvoke, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/websocket/native'

import * as v from 'valibot'

/** Localhost port the desktop application opens for this ACP process. */
export const ACP_BRIDGE_PORT = 47221

/** WebSocket URL of the desktop ACP bridge. */
export const ACP_BRIDGE_URL = `ws://127.0.0.1:${ACP_BRIDGE_PORT}/acp`

/** Error text when this process cannot reach the desktop application. */
export const AIRI_DESKTOP_NOT_STARTED = 'The AIRI desktop is not started'

/** Error text when the ACP Client link for a session is gone. */
export const ACP_CLIENT_DISCONNECTED = 'ACP Client is disconnected'

/** ACP Client capabilities that add tools to one chat session. */
export interface AcpBridgeCapabilities {
  readTextFile: boolean
  writeTextFile: boolean
  terminal: boolean
  elicitForm: boolean
}

/** Image the ACP Client sent with a prompt. */
export interface AcpBridgeAttachment {
  type: 'image'
  data: string
  mimeType: string
}

/** One stored chat line replayed when a client loads a session. */
export interface AcpBridgeTranscriptMessage {
  role: 'user' | 'assistant'
  text: string
}

/** Stream event the desktop application sends back during one prompt. */
export type AcpBridgeStreamEvent
  = { type: 'user-message', text: string }
    | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }
    | { type: 'tool-call', toolCallId: string, toolName: string, args: string }
    | { type: 'tool-result', toolCallId: string, result: string }
    | { type: 'tool-error', toolCallId: string, result: string }

/** Tool call the desktop application sends to this process. */
export interface AcpBridgeToolCall {
  name: 'read_text_file' | 'write_text_file' | 'terminal' | 'mcp_list_tools' | 'mcp_call_tool'
  arguments: Record<string, unknown>
}

/** Why one desktop prompt stopped. */
export type AcpBridgeStopReason = 'end_turn' | 'cancelled' | 'refusal' | 'max_tokens'

const CapabilitiesSchema = v.object({
  readTextFile: v.boolean(),
  writeTextFile: v.boolean(),
  terminal: v.boolean(),
  elicitForm: v.boolean(),
})

const AttachmentSchema = v.object({
  type: v.literal('image'),
  data: v.string(),
  mimeType: v.string(),
})

const StreamEventSchema = v.variant('type', [
  v.object({ type: v.literal('user-message'), text: v.string() }),
  v.object({ type: v.literal('text-delta'), text: v.string() }),
  v.object({ type: v.literal('reasoning-delta'), text: v.string() }),
  v.object({
    type: v.literal('tool-call'),
    toolCallId: v.string(),
    toolName: v.string(),
    args: v.string(),
  }),
  v.object({
    type: v.literal('tool-result'),
    toolCallId: v.string(),
    result: v.string(),
  }),
  v.object({
    type: v.literal('tool-error'),
    toolCallId: v.string(),
    result: v.string(),
  }),
])

const ToolCallSchema = v.object({
  name: v.picklist(['read_text_file', 'write_text_file', 'terminal', 'mcp_list_tools', 'mcp_call_tool']),
  arguments: v.record(v.string(), v.unknown()),
})

const StopReasonSchema = v.picklist(['end_turn', 'cancelled', 'refusal', 'max_tokens'])

export const AcpBridgeOpenSessionSchema = v.object({
  capabilities: CapabilitiesSchema,
  hasMcp: v.boolean(),
})

export const AcpBridgeLoadSessionSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
  capabilities: CapabilitiesSchema,
  hasMcp: v.boolean(),
})

const TranscriptMessageSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  text: v.pipe(v.string(), v.minLength(1)),
})

export const AcpBridgeLoadedSchema = v.object({
  messages: v.array(TranscriptMessageSchema),
})

export const AcpBridgePromptSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
  text: v.string(),
  attachments: v.array(AttachmentSchema),
  capabilities: CapabilitiesSchema,
  hasMcp: v.boolean(),
})

export const AcpBridgeSessionSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
})

export const AcpBridgePublishSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
  event: StreamEventSchema,
})

export const AcpBridgeCallToolSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
  call: ToolCallSchema,
})

export const AcpBridgeOpenedSchema = v.object({
  chatSessionId: v.pipe(v.string(), v.minLength(1)),
})

export const AcpBridgePromptResultSchema = v.object({
  stopReason: StopReasonSchema,
})

export const AcpBridgeToolResultSchema = v.object({
  text: v.string(),
})

export const AcpBridgeOkSchema = v.object({
  ok: v.literal(true),
})

export const acpBridgeOpenSession = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeOpenedSchema>,
  v.InferOutput<typeof AcpBridgeOpenSessionSchema>
>('acp-bridge:open-session')

export const acpBridgeLoadSession = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeLoadedSchema>,
  v.InferOutput<typeof AcpBridgeLoadSessionSchema>
>('acp-bridge:load-session')

export const acpBridgePrompt = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgePromptResultSchema>,
  v.InferOutput<typeof AcpBridgePromptSchema>
>('acp-bridge:prompt')

export const acpBridgeCloseSession = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeOkSchema>,
  v.InferOutput<typeof AcpBridgeSessionSchema>
>('acp-bridge:close-session')

export const acpBridgeCancel = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeOkSchema>,
  v.InferOutput<typeof AcpBridgeSessionSchema>
>('acp-bridge:cancel')

export const acpBridgePublish = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeOkSchema>,
  v.InferOutput<typeof AcpBridgePublishSchema>
>('acp-bridge:publish')

export const acpBridgeCallTool = defineInvokeEventa<
  v.InferOutput<typeof AcpBridgeToolResultSchema>,
  v.InferOutput<typeof AcpBridgeCallToolSchema>
>('acp-bridge:call-tool')

/** Callbacks for one chat session while its ACP Client link is open. */
export interface AcpBridgeSessionHandlers {
  publish: (event: AcpBridgeStreamEvent) => Promise<void>
  callTool: (call: AcpBridgeToolCall) => Promise<string>
}

/** Chat operations this ACP process calls on the bridge. */
export interface AcpBridge {
  openSession: (input: v.InferOutput<typeof AcpBridgeOpenSessionSchema>) => Promise<v.InferOutput<typeof AcpBridgeOpenedSchema>>
  loadSession: (input: v.InferOutput<typeof AcpBridgeLoadSessionSchema>) => Promise<v.InferOutput<typeof AcpBridgeLoadedSchema>>
  prompt: (input: v.InferOutput<typeof AcpBridgePromptSchema> & AcpBridgeSessionHandlers & { signal: AbortSignal }) => Promise<v.InferOutput<typeof AcpBridgePromptResultSchema>>
  closeSession: (chatSessionId: string) => Promise<void>
  bindSession: (chatSessionId: string, handlers: AcpBridgeSessionHandlers) => void
  unbindSession: (chatSessionId: string) => void
}

type BridgeContext = ReturnType<typeof createContext>['context']

export function connectAcpBridge(url: string = ACP_BRIDGE_URL): Promise<AcpBridge> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(AIRI_DESKTOP_NOT_STARTED))
    }, 2000)
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error(AIRI_DESKTOP_NOT_STARTED))
    }, { once: true })
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(bridgeFromSocket(createContext(socket).context))
    }, { once: true })
  })
}

function bridgeFromSocket(context: BridgeContext): AcpBridge {
  const sessions = new Map<string, AcpBridgeSessionHandlers>()
  const openSession = defineInvoke(context, acpBridgeOpenSession)
  const loadSession = defineInvoke(context, acpBridgeLoadSession)
  const prompt = defineInvoke(context, acpBridgePrompt)
  const closeSession = defineInvoke(context, acpBridgeCloseSession)
  const cancel = defineInvoke(context, acpBridgeCancel)

  defineInvokeHandler(context, acpBridgePublish, async (body) => {
    const parsed = v.parse(AcpBridgePublishSchema, body)
    await sessions.get(parsed.chatSessionId)?.publish(parsed.event)
    return { ok: true as const }
  })
  defineInvokeHandler(context, acpBridgeCallTool, async (body) => {
    const parsed = v.parse(AcpBridgeCallToolSchema, body)
    const text = await sessions.get(parsed.chatSessionId)?.callTool(parsed.call)
    return { text: text ?? ACP_CLIENT_DISCONNECTED }
  })

  return {
    openSession: async (input) => {
      const parsed = v.parse(AcpBridgeOpenSessionSchema, input)
      return v.parse(AcpBridgeOpenedSchema, await openSession(parsed))
    },
    loadSession: async (input) => {
      const parsed = v.parse(AcpBridgeLoadSessionSchema, input)
      return v.parse(AcpBridgeLoadedSchema, await loadSession(parsed))
    },
    bindSession: (chatSessionId, handlers) => {
      sessions.set(chatSessionId, handlers)
    },
    unbindSession: (chatSessionId) => {
      sessions.delete(chatSessionId)
    },
    closeSession: async (chatSessionId) => {
      sessions.delete(chatSessionId)
      await closeSession(v.parse(AcpBridgeSessionSchema, { chatSessionId }))
    },
    prompt: async (input) => {
      sessions.set(input.chatSessionId, { publish: input.publish, callTool: input.callTool })
      const stop = () => {
        void cancel({ chatSessionId: input.chatSessionId }).catch(() => {})
      }
      if (input.signal.aborted) {
        stop()
        return { stopReason: 'cancelled' }
      }
      input.signal.addEventListener('abort', stop, { once: true })
      try {
        const result = await prompt({
          chatSessionId: input.chatSessionId,
          text: input.text,
          attachments: input.attachments,
          capabilities: input.capabilities,
          hasMcp: input.hasMcp,
        })
        return v.parse(AcpBridgePromptResultSchema, result)
      }
      catch (error) {
        if (input.signal.aborted)
          return { stopReason: 'cancelled' }
        throw error
      }
      finally {
        input.signal.removeEventListener('abort', stop)
      }
    },
  }
}
