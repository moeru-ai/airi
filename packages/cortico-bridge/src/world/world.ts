import type { CorticoActFrame, CorticoClientFrame, CorticoServerFrame } from '@proj-airi/server-sdk-shared'
import type { Language } from 'cortico/core/language.ts'
import type {
  BlobInput,
  OutputTap,
  ToolDef,
  World,
  WorldConsoleDecl,
  WorldHost,
} from 'cortico/core/types.ts'
import type { StreamEvent } from 'cortico/protocol/open-responses/index.ts'
import type { WebSocketServer } from 'ws'

import type { AiriChannelClient, ChannelInbound } from '../channel.ts'

import { parseCorticoClientFrame } from '@proj-airi/server-sdk-shared'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer as WsServer } from 'ws'

/** One connected stage client. */
interface StageClient {
  name: string
  send: (frame: CorticoServerFrame) => void
  close: () => void
}

export interface AiriWorldOptions {
  /** WebSocket port the stage connects to. */
  port: number
  /** Display name used in self-archived events. */
  botName?: string
  /** Deployment timezone for event timestamps. */
  timezone?: string
  /** Receives provider config pushed by the stage; `null` clears it. */
  onProvider?: (config: { baseUrl: string, apiKey?: string, model: string } | null) => void
  /** AIRI server-channel module client; mods' traffic becomes persona events. */
  channel?: AiriChannelClient
  /** Persona memory workspace; `memory_query` frames report its contents. */
  memoryDir?: string
}

function nowIso(timezone: string): string {
  return new Date().toLocaleString('sv-SE', { timeZone: timezone }).replace(' ', 'T')
    + new Date().toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'longOffset' }).split(' ').pop()
}

/** Decodes `data:<mime>;base64,…` URLs into event blob attachments. */
function dataUrlsToBlobs(urls: string[] | undefined): BlobInput[] | undefined {
  const blobs = (urls ?? []).flatMap((url, index) => {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(url)
    if (!match)
      return []
    return [{
      bytes: new Uint8Array(Buffer.from(match[2], 'base64')),
      mime: match[1],
      name: `image-${index}`,
      fallbackText: `[image ${match[1]}]`,
    }]
  })
  return blobs.length ? blobs : undefined
}

/** Summarizes one memory section: file count + newest names (mtime desc). */
function memorySection(dir: string, name: string, recentCap = 5): { name: string, files: number, recent: string[] } {
  const abs = join(dir, name)
  let entries: { name: string, mtime: number }[] = []
  try {
    entries = readdirSync(abs, { withFileTypes: true })
      .filter(e => e.isFile() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, mtime: statSync(join(abs, e.name)).mtimeMs }))
  }
  catch {
    return { name, files: 0, recent: [] }
  }
  entries.sort((a, b) => b.mtime - a.mtime)
  return { name, files: entries.length, recent: entries.slice(0, recentCap).map(e => e.name) }
}

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url))
/**
 * The AIRI stage as a Cortico World: stage input becomes events, persona
 * output becomes `speak`/`act`/`delta` frames on the socket.
 */
export class AiriWorld implements World {
  readonly id = 'airi'
  private host: WorldHost | null = null
  private server: WebSocketServer | null = null
  private readonly clients = new Set<StageClient>()
  private readonly opts: AiriWorldOptions & { botName: string, timezone: string }
  /**
   * Chat sessions the stage reported plus channel conversations from mods,
   * QQ-style. Keyed by session id; `lastActive` picks the default reply
   * target. Channel sessions remember the input event data so replies can
   * echo it back for routing (e.g. discord channelId).
   */
  private readonly sessions = new Map<string, {
    label: string
    lastActive: number
    kind: 'stage' | 'channel'
    inputData?: Record<string, unknown>
    inputType?: string
  }>()
  /** Session that received the most recent user message. */
  private currentSessionId: string | null = null
  /** Latest ReplaceSelf context updates from mods, exposed as env vars. */
  private readonly channelContexts = new Map<string, { lane?: string, text: string, source: string }>()
  /** Spoken text per channel session this turn, flushed as chat:complete. */
  private readonly channelSpoken = new Map<string, { inputData?: Record<string, unknown>, inputType?: string, text: string }>()
  constructor(opts: AiriWorldOptions) {
    this.opts = { botName: 'AIRI', timezone: 'Asia/Shanghai', ...opts }
  }

  envPromptVars(): Record<string, string> {
    const lines = [...this.sessions.entries()].map(([id, s]) => `- ${s.label}${s.kind === 'channel' ? ' (外部)' : ''} (id: ${id})`)
    const ctxLines = [...this.channelContexts.entries()].map(([, c]) => `- [${c.source}${c.lane ? `/${c.lane}` : ''}] ${c.text}`)
    const stageState = this.clients.size > 0 ? `${this.clients.size} client(s) connected` : 'no audience connected'
    const channelState = this.opts.channel ? (this.opts.channel.isConnected ? 'channel online' : 'channel offline') : 'channel disabled'
    return {
      'airi.state': `${stageState}; ${channelState}`,
      'airi.conversations': lines.length ? lines.join('\n') : '(no conversations yet)',
      'airi.channel_contexts': ctxLines.length ? ctxLines.join('\n') : '(none)',
    }
  }

  console(language: Language = 'zh'): WorldConsoleDecl {
    return {
      label: language === 'zh' ? 'AIRI 舞台' : 'AIRI Stage',
      lamps: [{
        label: 'stage',
        state: this.clients.size > 0 ? 'online' : 'loading',
        hint: `${this.clients.size} client(s)`,
      }],
      promptDocs: [{
        key: 'worlds.airi.envPrompt',
        title: 'ENV_PROMPT',
        description: 'AIRI stage environment prompt.',
        path: ENV_PROMPT_FILE,
        role: 'envPrompt',
        vars: [{ name: 'airi.state', description: 'Connected stage clients.' }],
      }],
    }
  }

  /** Streams draft model output to the stage as `delta` frames. */
  outputTap(): OutputTap {
    return {
      onEvent: (event: StreamEvent) => {
        if (event.type === 'response.output_text.delta' && 'delta' in event && typeof event.delta === 'string')
          this.broadcast({ type: 'delta', text: event.delta })
      },
      // Drafts are not external output: a new user message may still preempt.
      externalizes: () => false,
      onRoundEnd: () => {},
      onAbort: () => {},
    }
  }

  tools(): ToolDef[] {
    return [
      {
        name: 'airi_speak',
        description: 'Say text out loud on stage: voiced by TTS and shown as your reply. One or two natural sentences per call.',
        tags: ['speak'],
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What to say.' },
            to: { type: 'string', description: 'Conversation label or id to reply in. Omit to answer the most recent conversation.' },
          },
          required: ['text'],
        },
        handler: async (args, ctx) => {
          const text = typeof args.text === 'string' ? args.text.trim() : ''
          if (!text)
            return '[speak failed] text must not be empty'
          const target = this.resolveSession(typeof args.to === 'string' ? args.to : undefined)
          if ('error' in target)
            return `[speak failed] ${target.error}`
          const entry = target.id ? this.sessions.get(target.id) : undefined
          const label = entry?.label ?? target.id
          if (entry?.kind === 'channel') {
            if (!this.opts.channel)
              return '[speak failed] channel not connected'
            const ok = this.opts.channel.sendChatMessage(entry.inputData, entry.inputType, text)
            if (!ok)
              return '[speak failed] channel send failed'
            // Accumulate for the turn-end `output:gen-ai:chat:complete`.
            if (target.id) {
              const prev = this.channelSpoken.get(target.id)
              this.channelSpoken.set(target.id, { inputData: entry.inputData, inputType: entry.inputType, text: prev ? `${prev.text} ${text}` : text })
            }
          }
          else {
            if (this.clients.size === 0)
              return '[speak failed] no stage client connected'
            this.broadcast({ type: 'speak', text, sessionId: target.id })
          }
          // Self-archive without waking the loop; tagged like QQ self events.
          this.host?.pushEvent(
            {
              type: 'airi.self',
              ts: nowIso(this.opts.timezone),
              source: this.id,
              text: `${label ? `[会话「${label}」] ` : ''}${this.opts.botName} said: ${text}`,
              meta: { body: text, ...(target.id ? { session: { id: target.id, label } } : {}) },
            },
            { deliver: false },
          ).catch(err => ctx.log.warn('self-archive failed', { err: String(err) }))
          return `[spoken${label ? ` → ${label}` : ''}]`
        },
      },
      {
        name: 'airi_act',
        description: 'Perform a stage direction: set emotion, play a named motion, or wait briefly.',
        tags: ['act'],
        parameters: {
          type: 'object',
          properties: {
            emotion: { type: 'string', description: 'One of: happy, sad, angry, think, surprised, awkward, question, curious, neutral.' },
            motion: { type: 'string', description: 'Named motion group to play.' },
            delay: { type: 'number', description: 'Seconds to pause before continuing.' },
            to: { type: 'string', description: 'Conversation label or id this act belongs to. Omit for the most recent conversation.' },
          },
        },
        handler: async (args) => {
          const frame: CorticoActFrame = { type: 'act' }
          if (typeof args.emotion === 'string' && args.emotion)
            frame.emotion = args.emotion
          if (typeof args.motion === 'string' && args.motion)
            frame.motion = args.motion
          if (typeof args.delay === 'number' && Number.isFinite(args.delay))
            frame.delay = args.delay
          if (!frame.emotion && !frame.motion && frame.delay === undefined)
            return '[act failed] provide emotion, motion, or delay'
          const target = this.resolveSession(typeof args.to === 'string' ? args.to : undefined)
          if ('error' in target)
            return `[act failed] ${target.error}`
          frame.sessionId = target.id
          this.broadcast(frame)
          return '[acted] stage direction dispatched'
        },
      },
      {
        name: 'airi_name_session',
        description: 'Name or rename a conversation (e.g. "聊猫的那个"). Call again whenever the topic drifts — the latest name replaces the old one in the chat UI and your conversation list.',
        tags: ['act'],
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Conversation label or id to rename. Omit for the most recent conversation.' },
            name: { type: 'string', description: 'Short conversation name, a few words.' },
          },
          required: ['name'],
        },
        handler: async (args) => {
          const name = typeof args.name === 'string' ? args.name.trim().slice(0, 40) : ''
          if (!name)
            return '[name failed] name must not be empty'
          const target = this.resolveSession(typeof args.to === 'string' ? args.to : undefined)
          if ('error' in target)
            return `[name failed] ${target.error}`
          if (!target.id)
            return '[name failed] no conversation to name yet'
          const entry = this.sessions.get(target.id) ?? { label: target.id, lastActive: Date.now(), kind: 'stage' as const }
          const oldLabel = entry.label
          entry.label = name
          this.sessions.set(target.id, entry)
          this.broadcast({ type: 'name_session', sessionId: target.id, label: name })
          // Self-archive so the timeline remembers the rename.
          this.host?.pushEvent(
            {
              type: 'airi.self',
              ts: nowIso(this.opts.timezone),
              source: this.id,
              text: `[系统] 你把会话「${oldLabel}」改名为「${name}」`,
              meta: { session: { id: target.id, label: name }, renamedFrom: oldLabel },
            },
            { deliver: false },
          ).catch(() => {})
          return `[named] conversation "${oldLabel}" is now "${name}"`
        },
      },
      {
        name: 'airi_call',
        description: 'Invoke a stage capability by name (mods call), e.g. a game or plugin action exposed by the connected stage.',
        tags: ['act'],
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Capability name.' },
            payload: { description: 'Capability arguments.' },
          },
          required: ['name'],
        },
        handler: async (args) => {
          const name = typeof args.name === 'string' ? args.name.trim() : ''
          if (!name)
            return '[call failed] name must not be empty'
          // Channel capabilities: directives to sub-agent mods.
          if (name === 'spark_command') {
            if (!this.opts.channel)
              return '[call failed] channel not connected'
            const payload = (args.payload ?? {}) as { destinations?: string[], intent?: string, guidance?: unknown, interrupt?: string, priority?: string }
            if (!Array.isArray(payload.destinations) || payload.destinations.length === 0)
              return '[call failed] spark_command requires payload.destinations (mod names, e.g. ["minecraft-bot"])'
            const ok = this.opts.channel.sendSparkCommand({
              destinations: payload.destinations,
              intent: payload.intent as never,
              guidance: payload.guidance as never,
              interrupt: payload.interrupt as never,
              priority: payload.priority as never,
            })
            return ok ? `[command sent → ${payload.destinations.join(', ')}]` : '[call failed] channel send failed'
          }
          if (this.clients.size === 0)
            return '[call failed] no stage client connected'
          this.broadcast({ type: 'call', name, payload: args.payload })
          return '[called] dispatched to stage'
        },
      },
    ]
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host
    const { promise, resolve, reject } = Promise.withResolvers<void>()
    const server = new WsServer({ port: this.opts.port })
    server.on('listening', () => resolve())
    server.on('error', err => reject(err))
    server.on('connection', (socket) => {
      const client: StageClient = {
        name: 'user',
        send: frame => socket.send(JSON.stringify(frame)),
        close: () => socket.close(),
      }
      this.clients.add(client)
      socket.on('message', (raw) => {
        let frame: CorticoClientFrame
        try {
          frame = parseCorticoClientFrame(JSON.parse(String(raw)))
        }
        catch {
          client.send({ type: 'sys', text: 'malformed frame' })
          return
        }
        this.onFrame(client, frame)
      })
      socket.on('close', () => this.clients.delete(client))
      socket.on('error', () => this.clients.delete(client))
      client.send({ type: 'sys', text: 'connected to cortico bridge' })
    })
    this.server = server
    await promise

    // AIRI server channel: mods' traffic becomes persona events.
    if (this.opts.channel) {
      const channel = this.opts.channel
      channel.handlers.onInbound = inbound => this.onChannelInbound(inbound)
      channel.handlers.onReplaceContext = (contextId, lane, text, source) => {
        this.channelContexts.set(contextId, { lane, text, source })
      }
      await channel.connect().catch((err) => {
        host.log.warn('AIRI server channel connect failed; mods unreachable', { err: String(err) })
      })
    }
  }

  /** A mod's channel event becomes a persona event, tagged like stage input. */
  private onChannelInbound(inbound: ChannelInbound): void {
    if (!this.host)
      return
    if (inbound.session) {
      const prev = this.sessions.get(inbound.session.id)
      this.sessions.set(inbound.session.id, {
        label: inbound.session.label,
        lastActive: Date.now(),
        kind: 'channel',
        inputData: inbound.inputData ?? prev?.inputData,
        inputType: inbound.inputType ?? prev?.inputType,
      })
      this.currentSessionId = inbound.session.id
    }
    void this.host.pushEvent(
      {
        type: `airi.${inbound.kind}`,
        ts: nowIso(this.opts.timezone),
        source: this.id,
        senderKey: inbound.session?.label ?? 'channel',
        text: inbound.text,
        meta: { ...inbound.meta, ...(inbound.session ? { session: inbound.session } : {}) },
      },
      inbound.trigger === 'archive' ? { deliver: false } : { trigger: inbound.trigger },
    ).catch(err => this.host?.log.warn('channel event push failed', { err: String(err) }))
  }

  private onFrame(client: StageClient, frame: CorticoClientFrame): void {
    if (frame.type === 'provider') {
      this.opts.onProvider?.(frame.config)
      client.send({ type: 'sys', text: frame.config ? `provider set: ${frame.config.model} @ ${frame.config.baseUrl}` : 'provider cleared' })
      return
    }
    if (frame.type === 'hello') {
      if (frame.name?.trim())
        client.name = frame.name.trim().slice(0, 32)
      return
    }
    if (frame.type === 'memory_query') {
      client.send(this.memorySnapshot())
      return
    }
    if (frame.type === 'sessions') {
      for (const s of frame.sessions) {
        const prev = this.sessions.get(s.id)
        this.sessions.set(s.id, { label: s.label, lastActive: prev?.lastActive ?? 0, kind: 'stage' })
      }
      return
    }
    if (!this.host)
      return
    const text = frame.type === 'msg' ? frame.text : frame.text
    const kind = frame.type === 'msg' ? 'airi.user_message' : `airi.${frame.kind}`
    const blobs = frame.type === 'msg' ? dataUrlsToBlobs(frame.images) : undefined
    const session = frame.type === 'msg' ? frame.session : undefined
    if (session) {
      this.sessions.set(session.id, { label: session.label, lastActive: Date.now(), kind: 'stage' })
      this.currentSessionId = session.id
    }
    const tag = session ? `[会话「${session.label}」] ` : ''
    void this.host.pushEvent({
      type: kind,
      ts: nowIso(this.opts.timezone),
      source: this.id,
      senderKey: client.name,
      text: frame.type === 'msg' ? `${tag}[${client.name}] ${text}` : text,
      blobs,
      meta: session ? { session: { id: session.id, label: session.label } } : undefined,
    })
  }

  /** Snapshot of the persona memory workspace for the settings page. */
  private memorySnapshot(): CorticoServerFrame {
    const dir = this.opts.memoryDir
    if (!dir)
      return { type: 'memory', dir: '', sections: [], totalFiles: 0 }
    const sections = ['memo/active', 'memo/archived', 'note', 'note/playbook', 'note/library', 'people']
      .map(name => memorySection(dir, name))
    return {
      type: 'memory',
      dir,
      sections,
      totalFiles: sections.reduce((n, s) => n + s.files, 0),
    }
  }

  /**
   * Resolves a `to` argument to a session id: exact id/label match, else the
   * current session, else the most recently active one. When the stage never
   * reported sessions, `id` is undefined and frames go out untargeted.
   */
  private resolveSession(to: string | undefined): { id?: string } | { error: string } {
    const wanted = to?.trim()
    if (wanted) {
      for (const [id, s] of this.sessions) {
        if (id === wanted || s.label === wanted)
          return { id }
      }
      return { error: `unknown conversation "${wanted}"; use a label or id from the conversation list` }
    }
    if (this.currentSessionId)
      return { id: this.currentSessionId }
    // No message yet: pick the most recently active known session.
    let best: { id: string, lastActive: number } | null = null
    for (const [id, s] of this.sessions) {
      if (!best || s.lastActive > best.lastActive)
        best = { id, lastActive: s.lastActive }
    }
    if (best)
      return { id: best.id }
    return {}
  }
  /** Flush accumulated channel replies as output:gen-ai:chat:complete. */
  private flushChannelSpoken(): void {
    for (const [, spoken] of this.channelSpoken)
      this.opts.channel?.sendChatComplete(spoken.inputData, spoken.inputType, spoken.text)
    this.channelSpoken.clear()
  }

  onTurnEnded(): void {
    this.broadcast({ type: 'turn_end' })
    this.flushChannelSpoken()
  }

  onHandoffEnded(): void {
    this.broadcast({ type: 'sys', text: '[context handoff completed]' })
    this.flushChannelSpoken()
    this.broadcast({ type: 'turn_end' })
  }

  async stop(): Promise<void> {
    this.host = null
    this.opts.channel?.close()
    for (const client of this.clients)
      client.close()
    this.clients.clear()
    const server = this.server
    this.server = null
    if (server) {
      const { promise, resolve } = Promise.withResolvers<void>()
      server.close(() => resolve())
      await promise
    }
  }

  private broadcast(frame: CorticoServerFrame): void {
    for (const client of this.clients)
      client.send(frame)
  }
}
