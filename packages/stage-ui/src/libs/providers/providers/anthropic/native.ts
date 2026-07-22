/**
 * Native Anthropic Messages API adapter.
 *
 * The xsai runtime speaks the OpenAI Chat Completions wire protocol. Anthropic
 * documents its OpenAI-compatible endpoint as a testing shim ("not considered a
 * long-term or production-ready solution") that drops prompt caching, thinking
 * output, and strict tool schemas, and it is absent from `/v1/messages`-only
 * proxies (https://github.com/moeru-ai/airi/issues/1565).
 *
 * This module bridges the two protocols at the `fetch` boundary instead: xsai
 * still emits an OpenAI-shaped request to `{baseURL}chat/completions`, and
 * {@link createNativeAnthropicFetch} rewrites it into a native
 * `{baseURL}messages` call, then rewrites the JSON (or SSE) response back into
 * the Chat Completions shape xsai parses. No other layer of the app changes.
 *
 * Envelope ownership: the OpenAI-wire and Anthropic-wire types below describe
 * exactly the subset of both protocols this adapter translates. They are owned
 * here — xsai only types the pre-serialization camelCase options, and pulling
 * in an Anthropic SDK for types alone would add a runtime dependency.
 */

/** Protocol revision sent as `anthropic-version` on every native request. */
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Fallback `max_tokens` when the caller does not set one. The Messages API
 * requires the field while Chat Completions treats it as optional, and AIRI's
 * chat path never sets it. 4096 is the floor across every Claude model still
 * served (older ones like claude-3-haiku cap there, and the API rejects —
 * not clamps — an over-cap value), so the default can never 400 a model a
 * proxy exposes; callers wanting longer replies pass `max_tokens` explicitly.
 */
const DEFAULT_MAX_TOKENS = 4096

interface OpenAIContentPart {
  type: string
  text?: string
  image_url?: { url?: string }
}

interface OpenAIToolCall {
  id?: string
  type?: string
  function?: { name?: string, arguments?: string }
}

interface OpenAIWireMessage {
  role: string
  content?: string | OpenAIContentPart[] | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

/** The subset of the Chat Completions request body this adapter translates. */
interface OpenAIWireRequest {
  model?: string
  messages?: OpenAIWireMessage[]
  stream?: boolean
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  top_p?: number
  stop?: string | string[]
  tools?: Array<{ type?: string, function?: { name?: string, description?: string, parameters?: Record<string, unknown> } }>
  tool_choice?: string | { type?: string, function?: { name?: string }, name?: string }
}

type AnthropicImageSource
  = | { type: 'base64', media_type: string, data: string }
    | { type: 'url', url: string }

type AnthropicToolResultContent = string | Array<{ type: 'text', text: string } | { type: 'image', source: AnthropicImageSource }>

type AnthropicContentBlock
  = | { type: 'text', text: string }
    | { type: 'image', source: AnthropicImageSource }
    | { type: 'tool_use', id: string, name: string, input: Record<string, unknown> }
    | { type: 'tool_result', tool_use_id: string, content: AnthropicToolResultContent }

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

interface AnthropicRequestBody {
  model: string
  messages: AnthropicMessage[]
  max_tokens: number
  system?: string
  stream?: boolean
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  tools?: Array<{ name: string, description?: string, input_schema: Record<string, unknown> }>
  tool_choice?: { type: 'auto' | 'any' | 'none' } | { type: 'tool', name: string }
  thinking?: { type: 'disabled' }
}

interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface AnthropicResponseMessage {
  id?: string
  model?: string
  stop_reason?: string | null
  content?: Array<{ type: string, text?: string, thinking?: string, id?: string, name?: string, input?: Record<string, unknown> }>
  usage?: AnthropicUsage
}

/**
 * One parsed frame of the Messages API SSE stream. Every field is optional
 * because frames are provider input — the handler guards each access.
 */
interface AnthropicSSEEvent {
  type?: string
  index?: number
  message?: { id?: string, model?: string, usage?: AnthropicUsage }
  content_block?: { type?: string, id?: string, name?: string, text?: string }
  delta?: { type?: string, text?: string, thinking?: string, partial_json?: string, stop_reason?: string | null }
  usage?: AnthropicUsage
  error?: unknown
}

/**
 * Models where adaptive thinking is ON when the `thinking` field is omitted
 * (the Claude Sonnet 5 family). Matched non-anchored so gateway-prefixed ids
 * like `anthropic/claude-sonnet-5` are recognized too.
 */
function isAdaptiveThinkingDefaultModel(model: string): boolean {
  return /claude-sonnet-5/.test(model)
}

function mapStopReason(stopReason: string | null | undefined): string {
  switch (stopReason) {
    case 'tool_use':
      return 'tool_calls'
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'length'
    case 'refusal':
      return 'content_filter'
    // end_turn, stop_sequence, pause_turn, and unknown future reasons all mean
    // "the model stopped normally" as far as the Chat Completions shape goes.
    default:
      return 'stop'
  }
}

function mapImagePart(url: string): { type: 'image', source: AnthropicImageSource } | undefined {
  const dataUri = /^data:([^;,]+);base64,(.*)$/.exec(url)
  if (dataUri)
    return { type: 'image', source: { type: 'base64', media_type: dataUri[1], data: dataUri[2] } }
  if (/^https?:\/\//.test(url))
    return { type: 'image', source: { type: 'url', url } }
  return undefined
}

function mapContentParts(content: string | OpenAIContentPart[] | null | undefined): AnthropicContentBlock[] {
  if (content == null)
    return []
  // The Messages API rejects empty text blocks, and xsai appends an assistant
  // turn with `content: ''` after every tool round — skip empties everywhere.
  if (typeof content === 'string')
    return content.length > 0 ? [{ type: 'text', text: content }] : []

  const blocks: AnthropicContentBlock[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) {
      blocks.push({ type: 'text', text: part.text })
    }
    else if (part.type === 'image_url' && part.image_url?.url) {
      const image = mapImagePart(part.image_url.url)
      if (image)
        blocks.push(image)
    }
    // input_audio / file parts are dropped, matching the behavior Anthropic's
    // own OpenAI-compatible endpoint documents for unsupported content.
  }
  return blocks
}

function mapToolResultContent(content: string | OpenAIContentPart[] | null | undefined): AnthropicToolResultContent {
  if (typeof content === 'string' || content == null)
    return content ?? ''

  const blocks: Array<{ type: 'text', text: string } | { type: 'image', source: AnthropicImageSource }> = []
  for (const part of content) {
    if (part.type === 'text' && part.text != null) {
      blocks.push({ type: 'text', text: part.text })
    }
    else if (part.type === 'image_url' && part.image_url?.url) {
      const image = mapImagePart(part.image_url.url)
      if (image)
        blocks.push(image)
    }
  }
  return blocks.length > 0 ? blocks : ''
}

function mapToolChoice(toolChoice: OpenAIWireRequest['tool_choice']): AnthropicRequestBody['tool_choice'] | undefined {
  if (toolChoice == null)
    return undefined
  if (typeof toolChoice === 'string') {
    if (toolChoice === 'auto')
      return { type: 'auto' }
    if (toolChoice === 'none')
      return { type: 'none' }
    if (toolChoice === 'required')
      return { type: 'any' }
    return undefined
  }
  if (toolChoice.type === 'function' && toolChoice.function?.name)
    return { type: 'tool', name: toolChoice.function.name }
  if (toolChoice.type === 'tool' && toolChoice.name)
    return { type: 'tool', name: toolChoice.name }
  if (toolChoice.type === 'auto' || toolChoice.type === 'any' || toolChoice.type === 'none')
    return { type: toolChoice.type }
  return undefined
}

/**
 * Translates a Chat Completions request body into a Messages API body.
 *
 * Before:
 * - `{ model, messages: [{role:'system'},...], tools: [{type:'function',function:{...}}], stream: true }`
 *
 * After:
 * - `{ model, system, messages: [...blocks], max_tokens, tools: [{name,input_schema}], stream: true }`
 *
 * Translation is whitelist-based: xsai serializes every leftover runtime
 * option into the wire body (snake_cased), and the Messages API rejects
 * unknown top-level fields with a 400 — so only fields this adapter
 * understands are carried over.
 */
function translateChatRequest(request: OpenAIWireRequest): AnthropicRequestBody {
  const model = request.model ?? ''
  const systemTexts: string[] = []
  const messages: AnthropicMessage[] = []
  // tool_result blocks must reference a tool_use the model actually saw;
  // orphans (e.g. a result for a skipped nameless tool_call) would 400.
  const emittedToolUseIds = new Set<string>()

  const appendBlocks = (role: 'user' | 'assistant', blocks: AnthropicContentBlock[]) => {
    if (blocks.length === 0)
      return
    const last = messages[messages.length - 1]
    // Merge consecutive same-role turns: the OpenAI shape emits one message
    // per tool result, while stricter Messages API implementations (the
    // proxies issue #1565 targets) expect alternating roles.
    if (last?.role === role)
      last.content.push(...blocks)
    else
      messages.push({ role, content: blocks })
  }

  for (const message of request.messages ?? []) {
    switch (message.role) {
      // Anthropic accepts a single top-level system prompt, so system and
      // developer turns are hoisted and joined — the same behavior Anthropic's
      // OpenAI-compatible endpoint documents.
      case 'system':
      case 'developer': {
        if (typeof message.content === 'string' && message.content.length > 0)
          systemTexts.push(message.content)
        else if (Array.isArray(message.content))
          systemTexts.push(...message.content.filter(part => part.type === 'text' && part.text).map(part => part.text!))
        break
      }
      case 'user': {
        appendBlocks('user', mapContentParts(message.content))
        break
      }
      case 'assistant': {
        const blocks = mapContentParts(message.content)
        for (const toolCall of message.tool_calls ?? []) {
          if (!toolCall.function?.name)
            continue
          let input: Record<string, unknown> = {}
          try {
            input = JSON.parse(toolCall.function.arguments?.trim() || '{}') as Record<string, unknown>
          }
          catch {
            // A malformed argument payload still has to round-trip so the
            // paired tool_result keeps its target; the model sees `{}`.
            input = {}
          }
          const id = toolCall.id ?? `toolu_${blocks.length}`
          emittedToolUseIds.add(id)
          blocks.push({ type: 'tool_use', id, name: toolCall.function.name, input })
        }
        appendBlocks('assistant', blocks)
        break
      }
      case 'tool': {
        // Results whose tool_use never made it into the translated history
        // are dropped for the same pairing rule.
        if (!message.tool_call_id || !emittedToolUseIds.has(message.tool_call_id))
          break
        appendBlocks('user', [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: mapToolResultContent(message.content) }])
        break
      }
      default:
        break
    }
  }

  const body: AnthropicRequestBody = {
    model,
    messages,
    max_tokens: request.max_tokens ?? request.max_completion_tokens ?? DEFAULT_MAX_TOKENS,
  }

  if (systemTexts.length > 0)
    body.system = systemTexts.join('\n')
  if (request.stream === true)
    body.stream = true

  // Claude 4+ rejects requests carrying BOTH temperature and top_p, and the
  // Messages API bounds temperature to [0, 1] — clamp and prefer temperature
  // when a caller (legally, on the OpenAI protocol) sends both.
  if (typeof request.temperature === 'number')
    body.temperature = Math.min(Math.max(request.temperature, 0), 1)
  else if (typeof request.top_p === 'number')
    body.top_p = request.top_p

  if (request.stop != null) {
    // The Messages API rejects empty or whitespace-only stop sequences that
    // the OpenAI protocol allows (e.g. the common "\n").
    const stopSequences = (Array.isArray(request.stop) ? request.stop : [request.stop]).filter(stop => stop.trim().length > 0)
    if (stopSequences.length > 0)
      body.stop_sequences = stopSequences
  }

  const tools = (request.tools ?? [])
    .filter(tool => tool.function?.name)
    .map(tool => ({
      name: tool.function!.name!,
      description: tool.function!.description,
      input_schema: tool.function!.parameters ?? { type: 'object' },
    }))
  if (tools.length > 0) {
    body.tools = tools
    const toolChoice = mapToolChoice(request.tool_choice)
    if (toolChoice)
      body.tool_choice = toolChoice

    // NOTICE:
    // Tool loops need thinking OFF on models where adaptive thinking is the
    // default when the field is omitted (Claude Sonnet 5 family): with
    // thinking on, the Messages API requires the previous assistant turn's
    // signed thinking blocks to be echoed before its tool_use blocks, but the
    // OpenAI-shaped history xsai maintains cannot carry them, so round 2 of
    // any tool call would 400. The field is sent ONLY to that allowlist —
    // older models may reject the `thinking` field outright, and on everything
    // else omitting it already means "off". Always-thinking models
    // (Fable/Mythos) reject `disabled` and remain a documented tool-use
    // limitation of this adapter.
    // Source: platform.claude.com/docs/en/build-with-claude/extended-thinking
    // (tool-use echo requirement); removal condition: xsai history preserving
    // thinking blocks + signatures end-to-end.
    if (isAdaptiveThinkingDefaultModel(model))
      body.thinking = { type: 'disabled' }
  }

  return body
}

function toOpenAIUsage(usage: AnthropicUsage | undefined) {
  // Cache reads/writes are still input the provider processed; fold them into
  // prompt_tokens so cost dashboards see the full input size.
  const promptTokens = (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
  const completionTokens = usage?.output_tokens ?? 0
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  }
}

/**
 * Translates a non-streaming Messages API response into a Chat Completions
 * response.
 *
 * Before:
 * - `{ content: [{type:'text',text:'hi'},{type:'tool_use',...}], stop_reason: 'tool_use' }`
 *
 * After:
 * - `{ choices: [{ message: { content: 'hi', tool_calls: [...] }, finish_reason: 'tool_calls' }] }`
 */
function translateChatResponse(response: AnthropicResponseMessage): Record<string, unknown> {
  const textParts: string[] = []
  const reasoningParts: string[] = []
  const toolCalls: Array<{ id: string, type: 'function', function: { name: string, arguments: string } }> = []

  for (const block of response.content ?? []) {
    if (block.type === 'text' && block.text != null)
      textParts.push(block.text)
    else if (block.type === 'thinking' && block.thinking)
      reasoningParts.push(block.thinking)
    else if (block.type === 'tool_use' && block.name)
      toolCalls.push({ id: block.id ?? `toolu_${toolCalls.length}`, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } })
  }

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: textParts.length > 0 ? textParts.join('') : null,
  }
  if (reasoningParts.length > 0)
    message.reasoning_content = reasoningParts.join('')
  if (toolCalls.length > 0)
    message.tool_calls = toolCalls

  return {
    id: response.id ?? 'chatcmpl-anthropic',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model ?? '',
    choices: [{
      index: 0,
      message,
      finish_reason: mapStopReason(response.stop_reason),
      logprobs: null,
    }],
    usage: toOpenAIUsage(response.usage),
  }
}

interface SSEBlockState {
  kind: 'text' | 'thinking' | 'tool' | 'ignored'
  toolIndex?: number
  toolId?: string
  toolName?: string
}

/**
 * Translates an Anthropic Messages SSE stream into a Chat Completions
 * `chat.completion.chunk` SSE stream.
 *
 * Event mapping:
 * - `message_start`            -> role-priming chunk (captures id/model/input usage)
 * - `content_block_delta`      -> `delta.content` (text_delta),
 *                                 `delta.reasoning_content` (thinking_delta),
 *                                 `delta.tool_calls[].function.arguments` (input_json_delta)
 * - `content_block_start` (tool_use) -> tool_calls entry carrying id + name
 * - `message_delta`            -> stop reason + output usage (buffered)
 * - `message_stop`             -> final chunk with finish_reason + usage, then `[DONE]`
 * - `error`                    -> `data: {"error": ...}` (xsai's SSE parser raises it)
 * - `ping` / signature deltas / unknown events -> dropped
 */
function createAnthropicSSETranslator(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const created = Math.floor(Date.now() / 1000)

  let buffer = ''
  let chunkId = 'chatcmpl-anthropic'
  let model = ''
  let roleEmitted = false
  let doneEmitted = false
  let stopReason: string | null | undefined
  let usage: AnthropicUsage = {}
  let toolCount = 0
  const blocks = new Map<number, SSEBlockState>()

  const emit = (controller: TransformStreamDefaultController<Uint8Array>, payload: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
  }

  const chunkOf = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
    id: chunkId,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason, logprobs: null }],
  })

  const emitRoleOnce = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (roleEmitted)
      return
    roleEmitted = true
    emit(controller, chunkOf({ role: 'assistant' }))
  }

  const emitFinal = (controller: TransformStreamDefaultController<Uint8Array>) => {
    if (doneEmitted)
      return
    doneEmitted = true
    emit(controller, {
      ...chunkOf({}, mapStopReason(stopReason)),
      usage: toOpenAIUsage(usage),
    })
    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
  }

  const handleEvent = (event: AnthropicSSEEvent, controller: TransformStreamDefaultController<Uint8Array>) => {
    switch (event.type) {
      case 'message_start': {
        chunkId = event.message?.id ?? chunkId
        model = event.message?.model ?? model
        usage = { ...usage, ...event.message?.usage }
        emitRoleOnce(controller)
        break
      }
      case 'content_block_start': {
        if (typeof event.index !== 'number')
          break
        const block = event.content_block ?? {}
        if (block.type === 'tool_use') {
          const toolIndex = toolCount++
          blocks.set(event.index, { kind: 'tool', toolIndex, toolId: block.id, toolName: block.name })
          emitRoleOnce(controller)
          emit(controller, chunkOf({
            tool_calls: [{ index: toolIndex, id: block.id, type: 'function', function: { name: block.name, arguments: '' } }],
          }))
        }
        else if (block.type === 'text') {
          blocks.set(event.index, { kind: 'text' })
          // Anthropic may seed the block with initial text.
          if (typeof block.text === 'string' && block.text.length > 0) {
            emitRoleOnce(controller)
            emit(controller, chunkOf({ content: block.text }))
          }
        }
        else if (block.type === 'thinking') {
          blocks.set(event.index, { kind: 'thinking' })
        }
        else {
          // redacted_thinking, server tool blocks, and future block types have
          // no Chat Completions representation.
          blocks.set(event.index, { kind: 'ignored' })
        }
        break
      }
      case 'content_block_delta': {
        const state = typeof event.index === 'number' ? blocks.get(event.index) : undefined
        const delta = event.delta ?? {}
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          emitRoleOnce(controller)
          emit(controller, chunkOf({ content: delta.text }))
        }
        else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          emitRoleOnce(controller)
          emit(controller, chunkOf({ reasoning_content: delta.thinking }))
        }
        else if (delta.type === 'input_json_delta' && state?.kind === 'tool' && typeof delta.partial_json === 'string') {
          emit(controller, chunkOf({
            tool_calls: [{ index: state.toolIndex, id: state.toolId, type: 'function', function: { name: state.toolName, arguments: delta.partial_json } }],
          }))
        }
        // signature_delta carries the thinking signature, which cannot cross
        // the OpenAI-shaped boundary — dropped.
        break
      }
      case 'message_delta': {
        if (event.delta?.stop_reason != null)
          stopReason = event.delta.stop_reason
        usage = { ...usage, ...event.usage }
        break
      }
      case 'message_stop': {
        emitRoleOnce(controller)
        emitFinal(controller)
        break
      }
      case 'error': {
        // xsai's JsonMessageTransformStream throws RemoteAPIError for any SSE
        // payload carrying an `error` key — forward it verbatim to reuse that
        // channel instead of inventing a side-band.
        emit(controller, { error: event.error ?? event })
        break
      }
      default:
        // ping / content_block_stop / unknown future events carry no state.
        break
    }
  }

  const processBuffer = (controller: TransformStreamDefaultController<Uint8Array>, flushing: boolean) => {
    // SSE events are separated by a blank line; the tail may be incomplete
    // unless the upstream closed.
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = flushing ? '' : (events.pop() ?? '')
    for (const rawEvent of events) {
      let data = ''
      for (const line of rawEvent.split(/\r?\n/)) {
        if (line.startsWith('data:'))
          data += (data.length > 0 ? '\n' : '') + line.slice(5).trimStart()
      }
      if (!data)
        continue
      try {
        handleEvent(JSON.parse(data) as AnthropicSSEEvent, controller)
      }
      catch {
        // A malformed frame is dropped rather than poisoning the stream; the
        // terminal message_stop (or upstream close) still ends the response.
      }
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      processBuffer(controller, false)
    },
    flush(controller) {
      buffer += decoder.decode()
      if (buffer.length > 0)
        processBuffer(controller, true)
      // An upstream that closed without message_stop (abort, proxy hiccup)
      // still gets the terminal chunk: any stop reason and usage received via
      // message_delta are preserved instead of silently discarded, and the
      // OpenAI [DONE] terminator lets downstream parsers finish.
      if (roleEmitted)
        emitFinal(controller)
    },
  })
}

function toHeaderRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {}
  if (!headers)
    return record
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers)
      record[key] = value
    return record
  }
  return { ...headers }
}

function toAnthropicHeaders(headers: HeadersInit | undefined, apiKey: string): Record<string, string> {
  const record = toHeaderRecord(headers)
  // The Messages API authenticates via x-api-key; sending the Bearer header
  // xsai injects alongside it is rejected by api.anthropic.com.
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === 'authorization')
      delete record[key]
  }
  record['x-api-key'] = apiKey
  record['anthropic-version'] = ANTHROPIC_VERSION
  // Anthropic requires this opt-in header for direct browser (CORS) calls;
  // the renderer is exactly that environment.
  record['anthropic-dangerous-direct-browser-access'] = 'true'
  return record
}

/**
 * Rewrites a Chat Completions endpoint URL to its Messages sibling.
 *
 * Before:
 * - `https://proxy.example/anthropic/v1/chat/completions?key=1`
 *
 * After:
 * - `https://proxy.example/anthropic/v1/messages?key=1`
 */
function toMessagesURL(url: string): string {
  return url.replace(/chat\/completions\/?(\?|$)/, 'messages$1')
}

/**
 * Options for {@link createNativeAnthropicFetch}.
 */
export interface NativeAnthropicFetchOptions {
  /** Anthropic API key, sent as `x-api-key` on every rewritten request. */
  apiKey: string
  /**
   * Underlying fetch implementation.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch
}

/**
 * Creates a `fetch` that transparently bridges xsai's OpenAI-protocol requests
 * onto the native Anthropic Messages API.
 *
 * `POST …/chat/completions` is rewritten to `POST …/messages` with a
 * translated body, and the JSON or SSE response is translated back. Every
 * other request (e.g. `GET …/models`, which the native API also serves) passes
 * through with only the auth headers swapped to Anthropic's scheme.
 */
export function createNativeAnthropicFetch(options: NativeAnthropicFetchOptions): typeof globalThis.fetch {
  const baseFetch = options.fetch ?? globalThis.fetch

  return async (input, init) => {
    // Normalize per fetch semantics: init fields override the Request's own.
    const request = input instanceof Request ? input : undefined
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = init?.headers ?? request?.headers
    const signal = init?.signal ?? request?.signal
    const isChatCompletions = method === 'POST' && /\/chat\/completions\/?$/.test(url.split('?')[0])

    if (!isChatCompletions) {
      return baseFetch(url, {
        ...init,
        method,
        headers: toAnthropicHeaders(headers, options.apiKey),
        signal,
      })
    }

    const rawBody = init?.body != null ? String(init.body) : request != null ? await request.text() : ''
    let wireRequest: OpenAIWireRequest | undefined
    try {
      wireRequest = JSON.parse(rawBody || '{}') as OpenAIWireRequest
    }
    catch {
      // A body this adapter cannot parse cannot be translated either — forward
      // it verbatim so the provider's own "invalid JSON" error names the real
      // cause instead of a synthetic empty-model complaint.
      wireRequest = undefined
    }

    const response = await baseFetch(toMessagesURL(url), {
      method: 'POST',
      headers: toAnthropicHeaders(headers, options.apiKey),
      body: wireRequest != null ? JSON.stringify(translateChatRequest(wireRequest)) : rawBody,
      signal,
    })

    // Non-2xx responses pass through untouched: xsai's responseCatch surfaces
    // the status plus Anthropic's error JSON, which is what the app's
    // provider-error classifiers already parse.
    if (!response.ok)
      return response

    // Keep upstream diagnostics (request-id, anthropic-ratelimit-*) on the
    // translated response; only the content type is ours.
    const translatedHeaders = new Headers(response.headers)

    if (wireRequest?.stream === true && response.body != null) {
      translatedHeaders.set('Content-Type', 'text/event-stream')
      return new Response(response.body.pipeThrough(createAnthropicSSETranslator()), {
        status: response.status,
        headers: translatedHeaders,
      })
    }

    const text = await response.text()
    let json: AnthropicResponseMessage
    try {
      json = JSON.parse(text) as AnthropicResponseMessage
    }
    catch {
      // A 2xx with a non-JSON body (misbehaving proxy) is returned as-is so
      // xsai's responseJSON reports the actual payload instead of this
      // adapter masking it with a bare SyntaxError.
      return new Response(text, { status: response.status, headers: translatedHeaders })
    }

    translatedHeaders.set('Content-Type', 'application/json')
    return new Response(JSON.stringify(translateChatResponse(json)), {
      status: response.status,
      headers: translatedHeaders,
    })
  }
}
