import type { PhotonBotConfig, PhotonModuleSettings } from '../config'
import type { PhotonConnection, PhotonEvent, PhotonMessage } from '../photon/client'
import type { QuotedMessage } from './inbound-text'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Client as ServerChannel } from '@proj-airi/server-sdk'
import { safeParse } from 'valibot'

import { moduleSettingsSchema } from '../config'
import { getMessage, markRead, PhotonAuthError, PhotonStream, sendText, setTyping } from '../photon/client'
import { replyTextFor, shapeOf, tapbackTextFor } from './inbound-text'
import { maskHandle, replyTextOf } from './reply-text'

const log = useLogg('PhotonAdapter').useGlobalConfig()

/** Travels with `input:text`. AIRI copies the input into the reply event, so it names the turn that a reply answers. */
interface PhotonContext {
  messageId: string
  spaceId: string
  agentUserId: string
  handle: string
}

type TurnResult = { text: string } | { retry: string } | { timeout: true }

/** What the character gets for one inbound message. */
interface Inbound {
  kind: 'text' | 'reply' | 'tapback'
  text: string
}

/** iMessage hides the typing bubble after a while, so the bot refreshes it while AIRI writes the reply. */
const TYPING_REFRESH_MS = 10_000
/** The number of received and sent messages that the bot keeps for quotes. An older message is read from Photon. */
const RECENT_MESSAGES_MAX = 200

export interface PhotonAdapterDeps {
  airiClient?: ServerChannel
  send?: typeof sendText
  markRead?: typeof markRead
  setTyping?: typeof setTyping
  getMessage?: typeof getMessage
  replyTimeoutMs?: number
  retryDelayMs?: number
  authRetryDelayMs?: number
}

/**
 * Joins one Photon project to AIRI.
 *
 * The Photon connection comes from the environment at the start. The iMessage page of AIRI can replace it or remove it
 * at any time with `module:configure`. Each connection owns one stream. A text that belongs to a replaced connection
 * gets no reply.
 */
export class PhotonAdapter {
  private readonly airiClient: ServerChannel
  private readonly send: typeof sendText
  private readonly markRead: typeof markRead
  private readonly setTyping: typeof setTyping
  private readonly getMessage: typeof getMessage
  /** The newest messages that the bot received or sent. A reply or a tapback quotes its message from here. */
  private readonly recent = new Map<string, QuotedMessage>()
  /** The content types that the log already has a report for. */
  private readonly reportedTypes = new Set<string>()
  /** The Photon project in use. It is not set while the bot waits for settings or while AIRI disables the integration. */
  private connection?: PhotonConnection
  private stream?: PhotonStream
  private pending?: { messageId: string, resolve: (result: TurnResult) => void }
  /** The saved position in the stream of `cursorProjectId`. Photon counts the events of each project separately. */
  private cursor = 0
  private cursorProjectId?: string

  constructor(private readonly config: PhotonBotConfig, private readonly deps: PhotonAdapterDeps = {}) {
    this.send = deps.send ?? sendText
    this.markRead = deps.markRead ?? markRead
    this.setTyping = deps.setTyping ?? setTyping
    this.getMessage = deps.getMessage ?? getMessage
    if (existsSync(config.stateFile)) {
      const state = JSON.parse(readFileSync(config.stateFile, 'utf8')) as { cursor: number, projectId?: string }
      this.cursor = state.cursor
      this.cursorProjectId = state.projectId
    }

    this.airiClient = deps.airiClient ?? new ServerChannel({
      name: 'photon',
      possibleEvents: ['input:text', 'module:configure', 'output:gen-ai:chat:message', 'error'],
      token: config.airiToken,
      url: config.airiUrl,
      autoConnect: false,
    })

    this.airiClient.onEvent('output:gen-ai:chat:message', (event) => {
      // NOTICE:
      // The protocol types know only the `discord` input source, so the `photon` field is read through a cast.
      // Root cause: `InputSource` in `packages/plugin-protocol/src/types/events.ts` has no `photon` entry.
      // Remove the cast when `InputSource` has a `photon` entry.
      const input = event.data['gen-ai:chat']?.input?.data as { photon?: PhotonContext } | undefined
      if (this.pending && input?.photon?.messageId === this.pending.messageId)
        this.pending.resolve({ text: replyTextOf(event.data.message) })
    })

    // The server answers a required delivery with an error when no stage window consumes `input:text`.
    this.airiClient.onEvent('error', (event) => {
      if (event.data.message.includes('no consumer registered'))
        this.pending?.resolve({ retry: event.data.message })
    })

    this.airiClient.onEvent('module:configure', (event) => {
      const settings = safeParse(moduleSettingsSchema, event.data.config)
      if (settings.success)
        this.applySettings(settings.output)
      else
        log.warn('AIRI sent Photon settings that are not valid. The bot ignores them.')
    })
  }

  start(): void {
    const { photonBaseUrl, photonProjectId, photonApiKey } = this.config
    if (photonProjectId && photonApiKey)
      this.connectPhoton({ baseUrl: photonBaseUrl, projectId: photonProjectId, apiKey: photonApiKey })
    else
      log.warn('PHOTON_PROJECT_ID or PHOTON_API_KEY is not set. Waiting for the settings from AIRI.')

    this.airiClient.connect({ timeout: 15_000 }).then(
      () => log.log('Connected to AIRI'),
      error => log.error(`Cannot connect to AIRI: ${errorMessageFrom(error) ?? 'unknown'}. Check AIRI_URL and AIRI_TOKEN.`),
    )
  }

  stop(): void {
    this.disconnectPhoton()
    this.airiClient.close()
  }

  /** Applies the settings from the iMessage page of AIRI. They replace the values from the environment. */
  private applySettings(settings: PhotonModuleSettings): void {
    if (settings.enabled === false) {
      log.log('AIRI disabled the iMessage integration. The bot stops reading texts.')
      this.disconnectPhoton()
      return
    }

    const projectId = settings.projectId?.trim()
    const apiKey = settings.apiKey?.trim()
    if (!projectId || !apiKey) {
      log.warn('AIRI enabled the iMessage integration without a project ID or an API key. The bot stops reading texts.')
      this.disconnectPhoton()
      return
    }

    // The same settings keep the stream, so a text in progress still gets its reply.
    // After a rejected key, the same settings connect again at once. The person can then correct the key in Photon and select Save.
    if (this.connection?.projectId === projectId && this.connection.apiKey === apiKey && !this.stream?.rejected)
      return

    log.log(`Connecting to Photon project ${projectId} with the settings from AIRI`)
    this.connectPhoton({ baseUrl: this.config.photonBaseUrl, projectId, apiKey })
  }

  private connectPhoton(connection: PhotonConnection): void {
    this.disconnectPhoton()
    // The cursor of one project means nothing in another project. A new project starts at the live end of its stream.
    if (this.cursorProjectId !== connection.projectId) {
      this.cursor = 0
      this.cursorProjectId = connection.projectId
    }

    log.log(`Starting the Photon stream from cursor ${this.cursor}`)
    this.connection = connection
    this.stream = new PhotonStream({
      ...connection,
      cursor: () => this.cursor,
      onDelivery: (event, seq) => this.handleDelivery(connection, event, seq),
      authRetryDelayMs: this.deps.authRetryDelayMs,
    })
    this.stream.start()
  }

  private disconnectPhoton(): void {
    this.connection = undefined
    this.stream?.close()
    this.stream = undefined
    // The text in progress gets no reply. The cursor stays before it, so Photon replays it for the same project.
    if (this.pending)
      log.warn(`Text ${this.pending.messageId} gets no reply now, because the Photon connection changed.`)
    this.pending?.resolve({ retry: 'the Photon connection changed' })
  }

  private async handleDelivery(connection: PhotonConnection, event: PhotonEvent, seq: number): Promise<void> {
    // A reconnect replays from the saved cursor, so a delivery can arrive a second time.
    if (seq <= this.cursor)
      return

    if (event.type === 'message.received')
      await this.answer(connection, event.data.object)

    // The cursor moves only after the delivery is handled. A crash before this line replays the delivery.
    this.cursor = seq
    writeFileSync(this.config.stateFile, JSON.stringify({ cursor: seq, projectId: connection.projectId }))
  }

  /** Gives one inbound message to the character and sends the reply. Content that the bot does not handle gets no reply. */
  private async answer(connection: PhotonConnection, message: PhotonMessage): Promise<void> {
    const { id, space, sentBy, receivedBy } = message
    if (!space || !sentBy || !receivedBy || !message.content)
      return

    const inbound = await this.inboundOf(connection, message, receivedBy.id)
    if (!inbound) {
      this.reportUnhandled(message)
      return
    }

    const { kind, text } = inbound
    const who = maskHandle(sentBy.handle)
    log.log(`Received ${kind} ${id} from ${who}`)
    // The read receipt and the typing bubble are best effort: a failure is logged and never blocks the reply.
    // A rejected API key is the exception. The reply cannot go out with it, so the bot does not ask AIRI for one.
    const bestEffort = (what: string, call: Promise<unknown>) => call.catch((error) => {
      if (error instanceof PhotonAuthError)
        throw error
      log.warn(`${what} for ${kind} ${id} failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    })
    const typing = (on: boolean) => bestEffort(on ? 'Typing' : 'Stopping typing', this.setTyping(connection, space.id, receivedBy.id, on))

    // A tapback is not a message that a person reads, so it gets no read receipt.
    if (kind !== 'tapback')
      await bestEffort('Read receipt', this.markRead(connection, id))
    await typing(true)
    // A refresh that fails has no caller. The send after it reports a rejected API key.
    const typingRefresh = setInterval(() => void typing(true).catch(() => {}), TYPING_REFRESH_MS)
    let reply: string | undefined
    try {
      reply = await this.converse(connection, { messageId: id, spaceId: space.id, agentUserId: receivedBy.id, handle: sentBy.handle }, text)
    }
    finally {
      clearInterval(typingRefresh)
      await typing(false)
    }

    if (reply) {
      const sentId = await this.send(connection, { spaceId: space.id, senderId: receivedBy.id, text: reply, idempotencyKey: `airi-reply:${id}` })
      if (sentId)
        this.remember(sentId, { text: reply, fromAgent: true })
      log.log(`Sent the reply for ${kind} ${id} to ${who}`)
    }
    else if (reply === '') {
      log.warn(`AIRI replied to ${kind} ${id} with no text. Nothing was sent.`)
    }
  }

  /**
   * Returns the plain text that the character gets for a message. Returns nothing for content that the bot does not handle.
   *
   * AIRI takes plain text only. An inline reply and a tapback become a sentence that quotes the message they point to.
   */
  private async inboundOf(connection: PhotonConnection, message: PhotonMessage, agentUserId: string): Promise<Inbound | undefined> {
    const { id, content, parentMessageId } = message
    if (content?.type === 'text' && content.text) {
      this.remember(id, { text: content.text, fromAgent: false })
      if (!parentMessageId)
        return { kind: 'text', text: content.text }
      return { kind: 'reply', text: replyTextFor(content.text, await this.quoted(connection, parentMessageId, agentUserId)) }
    }

    // The OpenAPI document of Photon gives a reaction no `action`. A reaction that has one is not handled, so the log shows it.
    if (content?.type === 'reaction' && content.reaction && content.action === undefined)
      return { kind: 'tapback', text: tapbackTextFor(content.reaction, parentMessageId ? await this.quoted(connection, parentMessageId, agentUserId) : undefined) }

    return undefined
  }

  /** Finds the message that a reply or a tapback points to. Returns nothing when Photon does not have it. */
  private async quoted(connection: PhotonConnection, messageId: string, agentUserId: string): Promise<QuotedMessage | undefined> {
    const known = this.recent.get(messageId)
    if (known)
      return known

    try {
      const parent = await this.getMessage(connection, messageId)
      if (!parent)
        return undefined

      const quoted = { text: parent.content?.type === 'text' ? parent.content.text : undefined, fromAgent: parent.sentBy?.id === agentUserId }
      this.remember(messageId, quoted)
      return quoted
    }
    catch (error) {
      if (error instanceof PhotonAuthError)
        throw error
      // The quote is best effort. Without it the character still gets the reply or the tapback.
      log.warn(`Cannot read message ${messageId} for the quote: ${errorMessageFrom(error) ?? 'unknown'}`)
      return undefined
    }
  }

  private remember(messageId: string, message: QuotedMessage): void {
    this.recent.set(messageId, message)
    const oldest = this.recent.keys().next().value
    if (this.recent.size > RECENT_MESSAGES_MAX && oldest !== undefined)
      this.recent.delete(oldest)
  }

  /** Logs the shape of a message with content that the bot does not handle, one time for each content type. */
  private reportUnhandled(message: PhotonMessage): void {
    const type = message.content?.type ?? 'unknown'
    if (this.reportedTypes.has(type))
      return

    this.reportedTypes.add(type)
    log.warn(`Photon delivered content of the type "${type}", which the bot does not handle. The bot reports each type one time. Message: ${shapeOf(message)}`)
  }

  /**
   * Gives one text to the character and waits for the reply. Sends the text again until AIRI takes it.
   *
   * Throws when `connection` is no longer in use, so the caller sends no reply and does not move the cursor.
   */
  private async converse(connection: PhotonConnection, photon: PhotonContext, text: string): Promise<string | undefined> {
    while (this.connection === connection) {
      const result = await this.ask(photon, text)
      if (this.connection !== connection)
        break
      if ('text' in result)
        return result.text
      if ('timeout' in result) {
        log.error(`AIRI took text ${photon.messageId} and did not reply in time. Check the chat provider in AIRI.`)
        return undefined
      }

      log.warn(`AIRI did not take text ${photon.messageId} (${result.retry}). Trying again.`)
      await sleep(this.deps.retryDelayMs ?? 3000)
    }

    throw new Error(`The Photon connection changed before AIRI replied to text ${photon.messageId}`)
  }

  private async ask(photon: PhotonContext, text: string): Promise<TurnResult> {
    try {
      await this.airiClient.connect({ timeout: 15_000 })
    }
    catch (error) {
      return { retry: errorMessageFrom(error) ?? 'cannot connect to AIRI' }
    }

    const { promise, resolve } = Promise.withResolvers<TurnResult>()
    const timer = setTimeout(resolve, this.deps.replyTimeoutMs ?? 60_000, { timeout: true })
    this.pending = { messageId: photon.messageId, resolve }

    // Each space owns one persistent conversation. Without a binding, a reply would join the owner's private session.
    const data = {
      text,
      textRaw: text,
      overrides: {
        messagePrefix: `(From iMessage user ${maskHandle(photon.handle)}): `,
        binding: `photon:${photon.spaceId}:${photon.agentUserId}`,
      },
      photon,
    }
    // A required delivery makes the server report a missing consumer. Without it the server drops the input silently.
    if (!this.airiClient.send({ type: 'input:text', data, route: { delivery: { required: true } } }))
      resolve({ retry: `AIRI connection is ${this.airiClient.connectionStatus}` })

    return promise.finally(() => {
      clearTimeout(timer)
      this.pending = undefined
    })
  }
}
