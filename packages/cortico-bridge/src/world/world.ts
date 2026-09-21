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

import { parseCorticoClientFrame } from '@proj-airi/server-sdk-shared'
import { fileURLToPath } from 'node:url'
import { WebSocketServer as WsServer } from 'ws'

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url))

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

  constructor(opts: AiriWorldOptions) {
    this.opts = { botName: 'AIRI', timezone: 'Asia/Shanghai', ...opts }
  }

  envPromptVars(): Record<string, string> {
    return { 'airi.state': this.clients.size > 0 ? `${this.clients.size} client(s) connected` : 'no audience connected' }
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
          properties: { text: { type: 'string', description: 'What to say.' } },
          required: ['text'],
        },
        handler: async (args, ctx) => {
          const text = typeof args.text === 'string' ? args.text.trim() : ''
          if (!text)
            return '[speak failed] text must not be empty'
          if (this.clients.size === 0)
            return '[speak failed] no stage client connected'
          this.broadcast({ type: 'speak', text })
          // Self-archive without waking the loop.
          this.host?.pushEvent(
            {
              type: 'airi.self',
              ts: nowIso(this.opts.timezone),
              source: this.id,
              text: `[stage] ${this.opts.botName} said: ${text}`,
              meta: { body: text },
            },
            { deliver: false },
          ).catch(err => ctx.log.warn('self-archive failed', { err: String(err) }))
          return `[spoken] delivered to ${this.clients.size} stage client(s)`
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
          this.broadcast(frame)
          return '[acted] stage direction dispatched'
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
    if (!this.host)
      return
    const text = frame.type === 'msg' ? frame.text : frame.text
    const kind = frame.type === 'msg' ? 'airi.user_message' : `airi.${frame.kind}`
    const blobs = frame.type === 'msg' ? dataUrlsToBlobs(frame.images) : undefined
    void this.host.pushEvent({
      type: kind,
      ts: nowIso(this.opts.timezone),
      source: this.id,
      senderKey: client.name,
      text: frame.type === 'msg' ? `[${client.name}] ${text}` : text,
      blobs,
    })
  }

  onTurnEnded(): void {
    this.broadcast({ type: 'turn_end' })
  }

  onHandoffEnded(): void {
    this.broadcast({ type: 'sys', text: '[context handoff completed]' })
    this.broadcast({ type: 'turn_end' })
  }

  async stop(): Promise<void> {
    this.host = null
    for (const client of [...this.clients])
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
    for (const client of [...this.clients])
      client.send(frame)
  }
}
