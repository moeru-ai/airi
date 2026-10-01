import type { ContextSourceRef, ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import type { MineflayerWithAgents } from '../cognitive/types'

import { createContextText } from '@proj-airi/core-agent/context'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

interface MinecraftStatusSnapshot {
  botUsername: string
  serverHost: string
  serverPort: number
  position: string
  health: string
  gameMode: string
  otherPlayers: string[]
  /** The owner's in-game username (from BOT_MASTER_USERNAME), if configured. */
  masterUsername?: string
}

interface MinecraftContextBot {
  username: MineflayerWithAgents['username']
  bot: {
    entity?: {
      position?: Pick<MineflayerWithAgents['bot']['entity']['position'], 'x' | 'y' | 'z'>
    }
    health?: MineflayerWithAgents['bot']['health']
    game?: {
      gameMode?: MineflayerWithAgents['bot']['game']['gameMode']
    }
    players?: Partial<Record<Extract<keyof MineflayerWithAgents['bot']['players'], string>, unknown>>
  }
}

interface MinecraftContextBridge {
  onContextSourceRequest: (read: (sourceRef: ContextSourceRef) => string | undefined) => () => void
  onModuleAnnounced: (listener: (event: ModuleAnnouncedEvent) => void) => () => void
  sendContextUpdate: (update: ContextUpdate) => void
  setCommandAvailable: (available: boolean) => void
}

const STATUS_CONTEXT_ID = 'minecraft:status'
const STATUS_LANE = 'minecraft:status'
const STATUS_REFRESH_INTERVAL_MS = 5_000
const DESKTOP_RELAY_TOOL_NAME = 'builtIn_emitSparkCommand'

function toPositionString(bot: MinecraftContextBot) {
  const position = bot.bot.entity?.position
  return position
    ? `x: ${position.x.toFixed(1)}, y: ${position.y.toFixed(1)}, z: ${position.z.toFixed(1)}`
    : 'unknown'
}

function buildStatusText(snapshot: MinecraftStatusSnapshot) {
  return [
    `Bot online: ${snapshot.botUsername}`,
    'Desktop command relay: available.',
    `Relay tool: ${DESKTOP_RELAY_TOOL_NAME}. Destination: minecraft-bot.`,
    `Position: ${snapshot.position}`,
    `Health: ${snapshot.health}/20, Mode: ${snapshot.gameMode}`,
    `Other players online: ${snapshot.otherPlayers.length}`,
    ...(snapshot.masterUsername ? [`Owner: ${snapshot.masterUsername}`] : []),
  ].join('\n')
}

/** Full status for a host read. The pool observation stays short, so these facts stay in the module until a request needs them. */
function buildStatusDetails(snapshot: MinecraftStatusSnapshot | null, serverHost: string, serverPort: number, masterUsername?: string) {
  if (!snapshot) {
    return [
      buildOfflineStatusText(),
      `Configured server: ${serverHost}:${serverPort}`,
      ...(masterUsername ? [`Configured owner: ${masterUsername}`] : []),
    ].join('\n')
  }

  return [
    buildStatusText(snapshot),
    `Server: ${snapshot.serverHost}:${snapshot.serverPort}`,
    `Other players: ${snapshot.otherPlayers.length > 0 ? snapshot.otherPlayers.join(', ') : 'none'}`,
  ].join('\n')
}

function buildOfflineStatusText() {
  return [
    'Bot offline: no active Minecraft bot.',
    'Desktop command relay: unavailable.',
  ].join('\n')
}

function collectFrontendDestinations(event: ModuleAnnouncedEvent) {
  const pluginId = event.identity?.plugin?.id
  const instanceId = event.identity?.id

  if (!pluginId || !instanceId) {
    return []
  }

  return [`instance:${instanceId}`]
}

/**
 * Publishes Minecraft capability and status context through the AIRI server event seam.
 *
 * Use when:
 * - A Stage runtime needs current availability without Minecraft-specific UI code.
 * - The integration must reject relayed commands while no bot runtime is active.
 *
 * Expects:
 * - {@link bindBot} and {@link unbindBot} follow the Mineflayer runtime lifecycle.
 * - The AIRI bridge is initialized before status updates are published.
 *
 * Returns:
 * - Budgeted status facts with an origin handle. Full world details remain in this module.
 */
export class MinecraftContextService {
  private runtimeBot: MinecraftContextBot | null = null
  private currentSnapshot: MinecraftStatusSnapshot | null = null
  private lastPublishedText = ''
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeModuleAnnounced: (() => void) | null = null
  private unsubscribeSourceRequests: (() => void) | null = null
  private readonly serverHost: string
  private readonly serverPort: number
  private readonly refreshIntervalMs: number

  private readonly masterUsername?: string

  constructor(private readonly deps: {
    airiBridge: MinecraftContextBridge
    serverHost: string
    serverPort: number
    masterUsername?: string
    /** @default 5000 */
    refreshIntervalMs?: number
  }) {
    this.serverHost = deps.serverHost
    this.serverPort = deps.serverPort
    this.masterUsername = deps.masterUsername
    this.refreshIntervalMs = deps.refreshIntervalMs ?? STATUS_REFRESH_INTERVAL_MS
    if (!Number.isFinite(this.refreshIntervalMs) || this.refreshIntervalMs <= 0)
      throw new RangeError('Status refresh interval must be positive and finite')
  }

  init() {
    if (this.unsubscribeModuleAnnounced) {
      return
    }

    this.unsubscribeSourceRequests = this.deps.airiBridge.onContextSourceRequest(sourceRef =>
      sourceRef.refType === 'minecraft:status' && sourceRef.targetId === STATUS_CONTEXT_ID
        ? buildStatusDetails(this.refreshStatusSnapshot(), this.serverHost, this.serverPort, this.masterUsername)
        : undefined)

    this.unsubscribeModuleAnnounced = this.deps.airiBridge.onModuleAnnounced((event) => {
      const destinations = collectFrontendDestinations(event)
      if (destinations.length === 0) {
        return
      }

      void this.publishStatus({ force: true, destinations })
    })
  }

  bindBot(bot: MinecraftContextBot) {
    this.runtimeBot = bot
    this.deps.airiBridge.setCommandAvailable(true)
    this.refreshStatusSnapshot()
    void this.publishStatus({ force: true })

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }

    this.refreshTimer = setInterval(() => {
      // A live observation must renew even when its facts remain unchanged.
      void this.publishStatus({ force: true })
    }, this.refreshIntervalMs)
  }

  unbindBot() {
    const wasBound = this.runtimeBot !== null

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    this.deps.airiBridge.setCommandAvailable(false)
    this.runtimeBot = null
    this.currentSnapshot = null

    if (wasBound)
      void this.publishStatus({ force: true })
  }

  async publishStatus(options: { force?: boolean, destinations?: string[] } = {}) {
    const snapshot = this.refreshStatusSnapshot()
    const text = snapshot
      ? buildStatusText(snapshot)
      : buildOfflineStatusText()
    if (!options.force && text === this.lastPublishedText) {
      return
    }

    // Mark the text before the counter loads, so a concurrent unforced publish skips the same facts.
    this.lastPublishedText = text
    const update: ContextUpdate = {
      id: nanoid(),
      contextId: STATUS_CONTEXT_ID,
      lane: STATUS_LANE,
      ...await createContextText(text, { refType: 'minecraft:status', targetId: STATUS_CONTEXT_ID }),
      // Three missed refreshes expire an unavailable producer without retaining stale online status.
      ttlMs: this.refreshIntervalMs * 3,
      hints: [
        'status',
        snapshot ? 'online' : 'offline',
        ...(snapshot ? [snapshot.botUsername] : []),
      ],
      strategy: ContextUpdateStrategy.ReplaceSelf,
    }

    if (options.destinations?.length) {
      update.destinations = options.destinations
    }

    this.deps.airiBridge.sendContextUpdate(update)
  }

  getStatusSnapshot() {
    return this.currentSnapshot ? { ...this.currentSnapshot, otherPlayers: [...this.currentSnapshot.otherPlayers] } : null
  }

  destroy() {
    this.unbindBot()
    this.unsubscribeModuleAnnounced?.()
    this.unsubscribeModuleAnnounced = null
    this.unsubscribeSourceRequests?.()
    this.unsubscribeSourceRequests = null
  }

  private refreshStatusSnapshot() {
    if (!this.runtimeBot) {
      return this.currentSnapshot
    }

    const otherPlayers = Object.keys(this.runtimeBot.bot.players ?? {})
      .filter(name => name !== this.runtimeBot?.username)
      .sort((left, right) => left.localeCompare(right))

    this.currentSnapshot = {
      botUsername: this.runtimeBot.username,
      serverHost: this.serverHost,
      serverPort: this.serverPort,
      position: toPositionString(this.runtimeBot),
      health: String(this.runtimeBot.bot.health ?? 20),
      gameMode: this.runtimeBot.bot.game?.gameMode ?? 'unknown',
      otherPlayers,
      masterUsername: this.masterUsername,
    }

    return this.currentSnapshot
  }
}
