import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Fetch } from '@xsai/shared'
import type {
  CommonContentPart,
  CompletionToolCall,
  Message,
  Tool,
  ToolMessage,
} from '@xsai/shared-chat'

import type { McpPromptContentMode } from '../tools/mcp-prompt-content'
import type { StreamEvent } from './llm'

import { chat } from '@xsai/shared-chat'

import { getMcpToolBridge, normalizeQualifiedMcpToolName } from '../stores/mcp-tool-bridge'
import {
  formatMcpObservationUserContent,
  formatMcpToolResultPromptContent,
  formatRerouteObservation,
  getMcpPromptContentOptions,
} from '../tools/mcp-prompt-content'
import { extractWorkflowReroute } from '../tools/mcp-reroute'

interface RunManualToolLoopOptions {
  abortSignal?: AbortSignal
  approvalSessionId?: string
  chatProvider: ChatProvider
  headers?: Record<string, string>
  maxSteps: number
  messages: Message[]
  model: string
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  promptContentMode: McpPromptContentMode
  tools: Tool[]
}

interface StreamedAssistantStep {
  finishReason: string
  message: Message
  text: string
  toolCalls: Array<{
    id: string
    name: string
    type: 'function'
    argsText: string
  }>
}

export async function runManualToolLoop(options: RunManualToolLoopOptions): Promise<void> {
  const chatConfig = options.chatProvider.chat(options.model)
  const promptContentOptions = getMcpPromptContentOptions(options.promptContentMode)
  const messages = structuredClone(options.messages)

  for (let stepIndex = 0; stepIndex < options.maxSteps; stepIndex++) {
    throwIfAborted(options.abortSignal)

    const step = await streamAssistantStep({
      abortSignal: options.abortSignal,
      baseURL: String(chatConfig.baseURL),
      apiKey: chatConfig.apiKey,
      fetch: chatConfig.fetch,
      headers: options.headers,
      messages,
      model: options.model,
      tools: options.tools,
      onStreamEvent: options.onStreamEvent,
    })

    messages.push(step.message)

    if (step.toolCalls.length === 0) {
      // NOTICE: GitHub Models sometimes returns a text-only response that
      // fabricates tool results (e.g. "status=running") instead of actually
      // making a tool call.  When this happens on the first step and tools
      // are available, inject a hard constraint and retry ONCE so the model
      // gets a second chance to use the tools properly.
      if (shouldRetryFirstStepWithoutToolCall({
        stepIndex,
        text: step.text,
        tools: options.tools,
        messages,
      })) {
        messages.push({
          // TODO: prefer a more widely supported role once the provider matrix
          // is normalized; some inference servers do not render `developer`
          // messages consistently.
          role: 'developer',
          content: 'Your previous response did not include any tool calls. If the user\'s request can be fulfilled by calling a tool, you MUST make the tool call NOW using mcp_call_tool. Do not describe or simulate the result — actually call the tool.' as any,
        })
        // Continue to the next iteration which will re-prompt the model
        continue
      }

      await options.onStreamEvent?.({
        type: 'finish',
        finishReason: step.finishReason,
      } as StreamEvent)
      return
    }

    for (const toolCall of step.toolCalls) {
      throwIfAborted(options.abortSignal)

      const executed = await executeToolCall({
        approvalSessionId: options.approvalSessionId,
        abortSignal: options.abortSignal,
        messages,
        promptContentOptions,
        toolCall,
        tools: options.tools,
      })

      messages.push(executed.toolMessage)
      await options.onStreamEvent?.({
        type: 'tool-call',
        ...executed.completionToolCall,
      })
      await options.onStreamEvent?.({
        type: 'tool-result',
        toolCallId: executed.completionToolCall.toolCallId,
        result: executed.completionToolResult.result,
      })

      if (executed.observationMessage) {
        messages.push(executed.observationMessage)
      }
    }
  }
}

async function executeToolCall(params: {
  approvalSessionId?: string
  abortSignal?: AbortSignal
  messages: Message[]
  promptContentOptions: ReturnType<typeof getMcpPromptContentOptions>
  toolCall: StreamedAssistantStep['toolCalls'][number]
  tools: Tool[]
}): Promise<{
  completionToolCall: CompletionToolCall
  completionToolResult: {
    args: Record<string, unknown>
    result: ToolMessage['content']
    toolCallId: string
    toolName: string
  }
  observationMessage?: Message
  toolMessage: ToolMessage
}> {
  const tool = params.tools.find(candidate => candidate.function.name === params.toolCall.name)
  if (!tool) {
    throw new Error(`Model tried to call unavailable tool "${params.toolCall.name}".`)
  }

  const parsedArgs = JSON.parse(params.toolCall.argsText || '{}') as Record<string, unknown>
  throwIfAborted(params.abortSignal)

  let result: ToolMessage['content']
  let observationMessage: Message | undefined

  if (params.toolCall.name === 'mcp_call_tool') {
    const normalizedToolName = normalizeQualifiedMcpToolName(String(parsedArgs.name || ''))
    const rawResult = await getMcpToolBridge().callTool({
      name: normalizedToolName,
      arguments: Array.isArray(parsedArgs.parameters)
        ? Object.fromEntries(parsedArgs.parameters.map((entry: any) => [entry.name, entry.value]))
        : undefined,
      requestId: params.toolCall.id,
      ...(params.approvalSessionId ? { approvalSessionId: params.approvalSessionId } : {}),
    })

    // Dedicated reroute branch: workflow_reroute gets fixed-format observation
    // instead of generic tool-result formatting.
    const rerouteInstruction = extractWorkflowReroute(rawResult)
    if (rerouteInstruction) {
      result = formatRerouteObservation(rerouteInstruction)
    }
    else {
      result = await formatMcpToolResultPromptContent(rawResult, params.promptContentOptions)

      const observationContent = await formatMcpObservationUserContent(rawResult, params.promptContentOptions, {
        toolName: normalizedToolName || 'mcp_tool',
      })

      if (observationContent.length > 0) {
        observationMessage = {
          role: 'user',
          content: observationContent,
        }
      }
    }
  }
  else {
    result = wrapToolExecuteResult(await tool.execute(parsedArgs, {
      abortSignal: params.abortSignal,
      messages: params.messages,
      toolCallId: params.toolCall.id,
    }))
  }

  const completionToolCall: CompletionToolCall = {
    args: params.toolCall.argsText,
    toolCallId: params.toolCall.id,
    toolCallType: 'function',
    toolName: params.toolCall.name,
  }

  return {
    completionToolCall,
    completionToolResult: {
      args: parsedArgs,
      result,
      toolCallId: params.toolCall.id,
      toolName: params.toolCall.name,
    },
    observationMessage,
    toolMessage: {
      role: 'tool',
      tool_call_id: params.toolCall.id,
      content: result,
    },
  }
}

function shouldRetryFirstStepWithoutToolCall(params: {
  stepIndex: number
  text: string
  tools: Tool[]
  messages: Message[]
}) {
  if (params.stepIndex !== 0 || params.tools.length === 0 || params.text.trim().length === 0) {
    return false
  }

  const latestUserText = extractLatestUserText(params.messages)
  if (!latestUserText) {
    return false
  }

  if (looksLikeFabricatedToolStatus(params.text)) {
    return true
  }

  return looksLikeToolRequiredRequest(latestUserText)
}

function extractLatestUserText(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role !== 'user') {
      continue
    }

    if (typeof message.content === 'string') {
      return message.content.trim()
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => {
          if (typeof part === 'string') {
            return part
          }

          if (part && typeof part === 'object' && 'text' in part) {
            return String(part.text ?? '')
          }

          return ''
        })
        .join(' ')
        .trim()
    }
  }

  return ''
}

interface RetryContext {
  text: string
}

interface RetryRule {
  id: string
  description: string
  test: (context: RetryContext) => boolean
}

const TOOL_REQUIRED_REQUEST_RULES: RetryRule[] = [
  {
    id: 'mentions_tool_or_terminal_action_en',
    description: 'Matches English phrases indicating tool or terminal actions',
    test: ({ text }) => /\b(?:workflow_[a-z_]+|mcp_call_tool|terminal_exec|secret_read_env_value|clipboard_(?:read|write)_text|desktop_(?:observe|screenshot|open|focus|click|type|press|scroll)|run(?:ning)?\s+(?:workflow|tests?|command|git|build)|execute\s+(?:command|tool|workflow)|open\s+(?:terminal|finder|cursor|chrome|vs\s*code|app)|focus\s+(?:window|app|terminal|finder|cursor|vs\s*code)|read\s+(?:a\s+)?(?:file|clipboard|secret|token|env)|write\s+(?:a\s+)?(?:file|clipboard)|copy|paste|create\s+(?:a\s+)?file|use\s+(?:the\s+)?(?:tool|workflow|terminal)|click|type|press|scroll|screenshot|observe\s+windows?)\b/i.test(text),
  },
  {
    id: 'mentions_identifier_syntax',
    description: 'Matches scoped identifier syntax like plugin::action',
    test: ({ text }) => /\b[\w-]+::[\w-]+\b/.test(text),
  },
  {
    id: 'mentions_settings_route',
    description: 'Matches settings route path',
    test: ({ text }) => /\/settings\/modules\/[a-z0-9-]+/i.test(text),
  },
  {
    id: 'mentions_action_zh',
    description: 'Matches Chinese phrases indicating actions applied to tools/apps',
    test: ({ text }) => /(?:打开|开启|配置|设置|切换|点击|输入|填写|键入|保存|运行|执行|启动|关闭|聚焦|滚动|截图|观察|读取|写入|复制|粘贴|创建|修改|检查|验证)[\s\S]{0,18}(?:工具|工作流|命令|终端|窗口|应用|页面|浏览器|finder|vs\s*code|cursor|discord|文件|目录|设置页|开关|按钮|输入框|token|令牌|剪贴板)/i.test(text),
  },
  {
    id: 'mentions_desktop_companion_request_zh_en',
    description: 'Matches conversational requests to enter or observe the desktop surface',
    test: ({ text }) => /(?:到|进|进入|看看|看下|看一眼|陪我看|帮我看|切到|切回)[\s\S]{0,8}(?:桌面|屏幕|界面)|(?:桌面|屏幕|界面)[\s\S]{0,8}(?:看看|看下|观察|模式)|come\s+to\s+my\s+desktop|enter\s+desktop\s+mode|look\s+at\s+my\s+desktop|watch\s+my\s+screen/i.test(text),
  },
]

const FABRICATED_TOOL_STATUS_RULES: RetryRule[] = [
  {
    id: 'contains_fake_workflow_status_en',
    description: 'Matches English words implying fabricated status or action completion',
    test: ({ text }) => /\b(?:status\s*=|status:|executing|running|completed|done|finished|opened|clicked|typed|pressed|scrolled|tests?\s+(?:passed|failed)|workflow)\b/i.test(text),
  },
  {
    id: 'contains_fake_workflow_status_zh',
    description: 'Matches Chinese words implying fabricated status or action completion',
    test: ({ text }) => /状态[:：=]|正在执行|执行中|已经?(?:打开|点击|输入|填写|保存|完成|运行|执行|切换|启用|禁用)|测试已?(?:通过|失败)|工作流|命令已?执行/.test(text),
  },
]

function matchesAnyRule(rules: RetryRule[], context: RetryContext) {
  return rules.some(rule => rule.test(context))
}

function looksLikeToolRequiredRequest(text: string) {
  return matchesAnyRule(TOOL_REQUIRED_REQUEST_RULES, { text })
}

function looksLikeFabricatedToolStatus(text: string) {
  return matchesAnyRule(FABRICATED_TOOL_STATUS_RULES, { text })
}

// TODO: commonly used tool-result and message-shaping utilities should move to
// a shared chat util package instead of accumulating inside this adapter layer.
function wrapToolExecuteResult(result: unknown): ToolMessage['content'] {
  if (typeof result === 'string') {
    return result
  }

  if (Array.isArray(result) && result.every(isCommonContentPart)) {
    return result
  }

  return JSON.stringify(result)
}

function isCommonContentPart(value: unknown): value is CommonContentPart {
  if (!value || typeof value !== 'object') {
    return false
  }

  const type = typeof (value as { type?: unknown }).type === 'string'
    ? (value as { type: string }).type
    : undefined

  return type === 'text'
    || type === 'image_url'
    || type === 'input_audio'
    || type === 'file'
}

async function streamAssistantStep(params: {
  apiKey?: string
  abortSignal?: AbortSignal
  baseURL: string
  fetch?: Fetch | typeof globalThis.fetch
  headers?: Record<string, string>
  messages: Message[]
  model: string
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  tools: Tool[]
}): Promise<StreamedAssistantStep> {
  const response = await chat({
    apiKey: params.apiKey,
    abortSignal: params.abortSignal,
    baseURL: params.baseURL,
    fetch: params.fetch,
    headers: params.headers,
    messages: params.messages,
    model: params.model,
    stream: true,
    tools: params.tools,
  })

  const stream = response.body
  if (!stream) {
    throw new Error('Streaming response body is missing.')
  }

  const textParts: string[] = []
  const toolCalls: StreamedAssistantStep['toolCalls'] = []
  let finishReason = 'other'
  const transformed = stream.pipeThrough(createSseChunkTransform())
  const reader = transformed.getReader()

  try {
    while (true) {
      throwIfAborted(params.abortSignal)

      const { done, value: chunk } = await reader.read()
      if (done) {
        break
      }

      const choices = Array.isArray(chunk?.choices)
        ? chunk.choices
        : []
      const choice = choices[0]
      if (!choice) {
        continue
      }

      if (choice.finish_reason != null) {
        finishReason = String(choice.finish_reason)
      }

      const delta = choice.delta || {}
      if (typeof delta.content === 'string') {
        textParts.push(delta.content)
        await params.onStreamEvent?.({ type: 'text-delta', text: delta.content })
      }

      const deltaToolCalls = Array.isArray(delta.tool_calls)
        ? delta.tool_calls
        : []

      for (const partialToolCall of deltaToolCalls) {
        const index = Number(partialToolCall.index || 0)
        const existing = toolCalls[index]
        if (!existing) {
          toolCalls[index] = {
            id: String(partialToolCall.id),
            name: String(partialToolCall.function?.name || ''),
            type: 'function',
            argsText: String(partialToolCall.function?.arguments || ''),
          }
          continue
        }

        if (partialToolCall.id) {
          existing.id = String(partialToolCall.id)
        }
        if (partialToolCall.function?.name) {
          existing.name = String(partialToolCall.function.name)
        }
        if (partialToolCall.function?.arguments) {
          existing.argsText += String(partialToolCall.function.arguments)
        }
      }
    }
  }
  finally {
    reader.releaseLock()
    await stream.cancel().catch(() => undefined)
  }

  return {
    finishReason,
    message: {
      role: 'assistant',
      content: textParts.join(''),
      tool_calls: toolCalls.length > 0
        ? toolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: toolCall.argsText,
            },
          }))
        : undefined,
    },
    text: textParts.join(''),
    toolCalls,
  }
}

function emitBufferedSseLines(buffer: string, controller: TransformStreamDefaultController<any>) {
  const lines = buffer.split('\n')
  const trailing = lines.pop() ?? ''

  for (const line of lines) {
    if (!line.startsWith('data:')) {
      continue
    }

    const rawData = line.slice('data:'.length).trimStart()
    if (!rawData) {
      continue
    }

    if (rawData === '[DONE]') {
      // NOTICE: GitHub Models may keep the HTTP response open briefly after
      // sending the terminal `[DONE]` SSE frame. Treat that frame as the end of
      // the stream so the manual tool loop can emit `finish` instead of hanging
      // until the transport closes by itself.
      controller.terminate()
      return ''
    }

    controller.enqueue(JSON.parse(rawData))
  }

  return trailing
}

export function createSseChunkTransform() {
  // TODO: move this into upstream xsai/native stream helpers once the SSE
  // chunk handling can be supported there directly.
  const decoder = new TextDecoder()
  let buffer = ''

  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true })
      buffer += text
      buffer = emitBufferedSseLines(buffer, controller)
    },
    flush(controller) {
      const remaining = buffer.trim()
      if (!remaining) {
        return
      }

      if (remaining.startsWith('data:')) {
        const rawData = remaining.slice('data:'.length).trimStart()
        if (!rawData || rawData === '[DONE]') {
          return
        }

        controller.enqueue(JSON.parse(rawData))
      }
    },
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) {
    return
  }

  throw signal.reason ?? new DOMException('Aborted', 'AbortError')
}
