import type { Client } from '@proj-airi/server-sdk'
import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { Client as AiriClient, ContextUpdateStrategy } from '@proj-airi/server-sdk'

type SparkNotifyEvent = WebSocketEvents['spark:notify']
type SparkEmitEvent = WebSocketEvents['spark:emit']
type SparkCommandEvent = WebSocketEvents['spark:command']
type ContextUpdateEvent = WebSocketEvents['context:update']
type WebSocketEventInputText = WebSocketEvents['input:text']
type WebSocketEventInputTextVoice = WebSocketEvents['input:text:voice']

/** How a channel event should reach the persona. */
export interface ChannelInbound {
  /** Cortico event kind suffix: pushed as `airi.<kind>`. */
  kind: string
  /** Rendered event text (already tagged). */
  text: string
  /** Conversation identity for reply routing. */
  session?: { id: string, label: string }
  /** Raw input event data, echoed back in output events for routing. */
  inputData?: Record<string, unknown>
  /** The input event type (`input:text` / `input:text:voice`). */
  inputType?: string
  meta?: Record<string, unknown>
  /** 'flush' wakes the loop now; 'debounce' batches; 'archive' stores silently. */
  trigger: 'flush' | 'debounce' | 'archive'
}

export interface ChannelClientHandlers {
  onInbound: (inbound: ChannelInbound) => void
  /** Latest ReplaceSelf context per contextId, for env prompt vars. */
  onReplaceContext: (contextId: string, lane: string | undefined, text: string, source: string) => void
}

function sourceLabel(event: { metadata?: { source?: { id?: string, plugin?: { id?: string } } }, source?: string }): string {
  const src = event.metadata?.source
  return src?.plugin?.id ?? src?.id ?? event.source ?? 'mod'
}

/**
 * The bridge as an AIRI server-channel module: mods' input/context/spark
 * traffic becomes persona events; persona replies go back as
 * `output:gen-ai:chat:*` and `spark:command`.
 */
export class AiriChannelClient {
  private readonly client: Client
  readonly handlers: ChannelClientHandlers
  private connected = false

  constructor(opts: { url?: string, token?: string, name?: string }, handlers: ChannelClientHandlers) {
    this.handlers = handlers
    this.client = new AiriClient({
      name: opts.name ?? 'cortico',
      url: opts.url ?? 'ws://localhost:6121/ws',
      token: opts.token,
      possibleEvents: [
        'input:text',
        'input:text:voice',
        'context:update',
        'spark:notify',
        'spark:emit',
        'spark:command',
        'output:gen-ai:chat:message',
        'output:gen-ai:chat:complete',
        'module:consumer:register',
        'module:consumer:unregister',
      ],
      autoConnect: false,
      onReady: () => {
        this.connected = true
        // Take over chat ingestion from the stage's context-bridge while the
        // persona path is live. consumer-group 'first' picks one consumer.
        // `input:voice` (raw audio) is left alone: we cannot transcribe it.
        for (const event of ['input:text', 'input:text:voice']) {
          this.client.send({
            type: 'module:consumer:register',
            data: { event, mode: 'consumer-group', group: 'chat-ingestion' },
          })
        }
      },
      onClose: () => {
        this.connected = false
      },
    })

    this.client.onEvent('input:text', event => this.onInputText(event))
    this.client.onEvent('input:text:voice', event => this.onInputVoiceText(event))
    this.client.onEvent('spark:notify', event => this.onSparkNotify(event))
    this.client.onEvent('spark:emit', event => this.onSparkEmit(event))
    this.client.onEvent('spark:command', event => this.onSparkCommand(event))
    this.client.onEvent('context:update', event => this.onContextUpdate(event))
  }

  async connect(): Promise<void> {
    await this.client.connect()
  }

  close(): void {
    this.client.close()
  }

  get isConnected(): boolean {
    return this.connected
  }

  private onInputText(event: WebSocketBaseEvent<'input:text', WebSocketEventInputText>): void {
    const source = sourceLabel(event)
    const text = event.data.text?.trim()
    if (!text)
      return
    // Mods may pin a conversation (discord: per-channel session id) and a
    // sender prefix; honor both so replies route back correctly.
    const sessionId = event.data.overrides?.sessionId ?? `channel:${source}`
    const prefix = event.data.overrides?.messagePrefix ?? ''
    this.handlers.onInbound({
      kind: 'user_message',
      text: `[会话「${source}」] ${prefix}${text}`,
      session: { id: `channel:${sessionId}`, label: source },
      inputData: event.data as unknown as Record<string, unknown>,
      inputType: 'input:text',
      meta: { channel: 'input:text', source },
      trigger: 'debounce',
    })
    this.ingestContextUpdates(event.data.contextUpdates, source)
  }

  private onInputVoiceText(event: WebSocketBaseEvent<'input:text:voice', WebSocketEventInputTextVoice>): void {
    const source = sourceLabel(event)
    const text = event.data.transcription?.trim()
    if (!text)
      return
    const sessionId = event.data.overrides?.sessionId ?? `channel:${source}`
    const prefix = event.data.overrides?.messagePrefix ?? ''
    this.handlers.onInbound({
      kind: 'user_message',
      text: `[会话「${source}」·语音] ${prefix}${text}`,
      session: { id: `channel:${sessionId}`, label: `${source}·语音` },
      inputData: event.data as unknown as Record<string, unknown>,
      inputType: 'input:text:voice',
      meta: { channel: 'input:text:voice', source },
      trigger: 'debounce',
    })
    this.ingestContextUpdates(event.data.contextUpdates, source)
  }

  private ingestContextUpdates(updates: WebSocketEventInputText['contextUpdates'] | undefined, source: string): void {
    for (const update of updates ?? []) {
      if (update.strategy === ContextUpdateStrategy.ReplaceSelf) {
        this.handlers.onReplaceContext(update.contextId ?? update.id ?? `${source}-ctx`, update.lane, update.text, source)
        continue
      }
      this.handlers.onInbound({
        kind: 'context',
        text: `[context:${update.lane ?? 'general'}] ${update.text}`,
        meta: { channel: 'input-context-update', source, contextId: update.contextId ?? update.id, lane: update.lane },
        trigger: 'archive',
      })
    }
  }

  private onSparkNotify(event: WebSocketBaseEvent<'spark:notify', SparkNotifyEvent>): void {
    const source = sourceLabel(event)
    const d = event.data
    const parts = [`[spark:${d.kind ?? 'ping'}${d.urgency === 'immediate' ? '·紧急' : ''}] ${d.headline}`]
    if (d.note)
      parts.push(d.note)
    this.handlers.onInbound({
      kind: 'spark_notify',
      text: parts.join(' — '),
      meta: { channel: 'spark:notify', source, notify: d },
      trigger: d.urgency === 'immediate' ? 'flush' : 'debounce',
    })
    if (d.requiresAck) {
      this.sendEmit({
        id: `ack-${d.id}`,
        eventId: d.eventId,
        state: 'done',
        note: 'delivered to persona',
        destinations: [source],
      })
    }
  }

  private onSparkEmit(event: WebSocketBaseEvent<'spark:emit', SparkEmitEvent>): void {
    const source = sourceLabel(event)
    const d = event.data
    this.handlers.onInbound({
      kind: 'spark_emit',
      text: `[spark:emit] ${source}: ${d.state}${d.note ? ` — ${d.note}` : ''}`,
      meta: { channel: 'spark:emit', source, emit: d },
      trigger: 'archive',
    })
  }

  /** A directive addressed to us (or broadcast) becomes a persona event. */
  private onSparkCommand(event: WebSocketBaseEvent<'spark:command', SparkCommandEvent>): void {
    const source = sourceLabel(event)
    const d = event.data
    const steps = d.guidance?.options?.[0]?.steps?.join(' → ')
    this.handlers.onInbound({
      kind: 'spark_command',
      text: `[spark:command:${d.intent}] ${source}${steps ? ` — ${steps}` : ''}`,
      meta: { channel: 'spark:command', source, command: d },
      trigger: 'debounce',
    })
  }

  private onContextUpdate(event: WebSocketBaseEvent<'context:update', ContextUpdateEvent>): void {
    const source = sourceLabel(event)
    const d = event.data
    if (d.strategy === ContextUpdateStrategy.ReplaceSelf) {
      this.handlers.onReplaceContext(d.contextId ?? d.id, d.lane, d.text, source)
      return
    }
    this.handlers.onInbound({
      kind: 'context',
      text: `[context:${d.lane ?? 'general'}] ${d.text}`,
      meta: { channel: 'context:update', source, contextId: d.contextId, lane: d.lane },
      trigger: 'archive',
    })
  }

  /** Persona reply routed back to a channel conversation. */
  sendChatMessage(inputData: Record<string, unknown> | undefined, inputType: string | undefined, text: string): boolean {
    return this.client.send({
      type: 'output:gen-ai:chat:message',
      data: {
        ...(inputData ?? {}),
        message: { role: 'assistant', content: text },
        // Consumers (discord-bot) route replies via gen-ai:chat.input.data.
        'gen-ai:chat': { input: { type: inputType ?? 'input:text', data: inputData ?? {} } } as never,
      },
    })
  }

  /** Turn finished: mirrors the stage's `output:gen-ai:chat:complete`. */
  sendChatComplete(inputData: Record<string, unknown> | undefined, inputType: string | undefined, text: string): boolean {
    return this.client.send({
      type: 'output:gen-ai:chat:complete',
      data: {
        ...(inputData ?? {}),
        message: { role: 'assistant', content: text } as never,
        toolCalls: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, source: 'estimate-based' as const },
        'gen-ai:chat': { input: { type: inputType ?? 'input:text', data: inputData ?? {} } } as never,
      },
    })
  }

  /** Persona-issued directive to a sub-agent mod. */
  sendSparkCommand(payload: Partial<SparkCommandEvent> & { destinations: string[] }): boolean {
    return this.client.send({
      type: 'spark:command',
      data: {
        id: `cortico-${Date.now().toString(36)}`,
        commandId: `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        interrupt: payload.interrupt ?? 'soft',
        priority: payload.priority ?? 'normal',
        intent: payload.intent ?? 'action',
        guidance: payload.guidance,
        contexts: payload.contexts,
        destinations: payload.destinations,
      },
    })
  }

  sendEmit(emit: SparkEmitEvent): boolean {
    return this.client.send({ type: 'spark:emit', data: emit })
  }
}
