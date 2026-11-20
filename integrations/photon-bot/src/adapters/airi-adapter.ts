import type { PhotonBotConfig, PhotonModuleSettings } from '../config'
import type { PhotonConnection, PhotonEvent } from '../photon/client'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Client as ServerChannel } from '@proj-airi/server-sdk'
import { safeParse } from 'valibot'

import { moduleSettingsSchema } from '../config'
import { markRead, PhotonStream, sendText, setTyping } from '../photon/client'
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

/** iMessage hides the typing bubble after a while, so the bot refreshes it while AIRI writes the reply. */
const TYPING_REFRESH_MS = 10_000

export interface PhotonAdapterDeps {
  airiClient?: ServerChannel
  send?: typeof sendText
  markRead?: typeof markRead
  setTyping?: typeof setTyping
  replyTimeoutMs?: number
  retryDelayMs?: number
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
    if (this.connection?.projectId === projectId && this.connection.apiKey === apiKey)
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
    })
    this.stream.start()
  }

  private disconnectPhoton(): void {
    this.connection = undefined
    this.stream?.close()
    this.stream = undefined
    // The text in progress gets no reply. The cursor stays before it, so Photon replays it for the same project.
    this.pending?.resolve({ retry: 'the Photon connection changed' })
  }

  private async handleDelivery(connection: PhotonConnection, event: PhotonEvent, seq: number): Promise<void> {
    // A reconnect replays from the saved cursor, so a delivery can arrive a second time.
    if (seq <= this.cursor)
      return

    const { id, space, sentBy, receivedBy, content } = event.data.object
    if (event.type === 'message.received' && space && sentBy && receivedBy && content?.type === 'text' && content.text) {
      const who = maskHandle(sentBy.handle)
      log.log(`Received text ${id} from ${who}`)
      // The read receipt and the typing bubble are best effort: a failure is logged and never blocks the reply.
      const bestEffort = (what: string, call: Promise<unknown>) => call.catch(error => log.warn(`${what} for text ${id} failed: ${errorMessageFrom(error) ?? 'unknown'}`))
      const typing = (on: boolean) => bestEffort(on ? 'Typing' : 'Stopping typing', this.setTyping(connection, space.id, receivedBy.id, on))

      await bestEffort('Read receipt', this.markRead(connection, id))
      await typing(true)
      const typingRefresh = setInterval(() => void typing(true), TYPING_REFRESH_MS)
      let reply: string | undefined
      try {
        reply = await this.converse(connection, { messageId: id, spaceId: space.id, agentUserId: receivedBy.id, handle: sentBy.handle }, content.text)
      }
      finally {
        clearInterval(typingRefresh)
        await typing(false)
      }

      if (reply) {
        await this.send(connection, { spaceId: space.id, senderId: receivedBy.id, text: reply, idempotencyKey: `airi-reply:${id}` })
        log.log(`Sent the reply for text ${id} to ${who}`)
      }
      else if (reply === '') {
        log.warn(`AIRI replied to text ${id} with no text. Nothing was sent.`)
      }
    }

    // The cursor moves only after the delivery is handled. A crash before this line replays the delivery.
    this.cursor = seq
    writeFileSync(this.config.stateFile, JSON.stringify({ cursor: seq, projectId: connection.projectId }))
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
