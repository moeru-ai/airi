import type { ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import type { MineflayerWithAgents } from '../cognitive/types'

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
    `When the user asks to instruct or control this Minecraft bot, call the ${DESKTOP_RELAY_TOOL_NAME} tool.`,
    'Set destinations to ["minecraft-bot"], set intent to "action", and put the user\'s Minecraft instruction in guidance.options[0].label and guidance.options[0].steps.',
    'Do not claim that an instruction was relayed unless the tool call succeeds.',
    `Server: ${snapshot.serverHost}:${snapshot.serverPort}`,
    `Position: ${snapshot.position}`,
    `Health: ${snapshot.health}/20, Mode: ${snapshot.gameMode}`,
    `Other players online: ${snapshot.otherPlayers.length > 0 ? snapshot.otherPlayers.join(', ') : 'none'}`,
    ...(snapshot.masterUsername ? [`Master (your owner) in-game username: ${snapshot.masterUsername}`] : []),
  ].join('\n')
}

function buildOfflineStatusText(serverHost: string, serverPort: number, masterUsername?: string) {
  return [
    'Bot offline: no active Minecraft bot.',
    'Desktop command relay: unavailable.',
    `Do not call the ${DESKTOP_RELAY_TOOL_NAME} tool for Minecraft until a later status context says that the bot is online.`,
    `Configured server: ${serverHost}:${serverPort}`,
    ...(masterUsername ? [`Configured in-game master username: ${masterUsername}`] : []),
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
 * - A Stage runtime must discover how to relay a user instruction without Minecraft-specific UI code.
 * - The integration must reject relayed commands while no bot runtime is active.
 *
 * Expects:
 * - {@link bindBot} and {@link unbindBot} follow the Mineflayer runtime lifecycle.
 * - The AIRI bridge is initialized before status updates are published.
 *
 * Returns:
 * - Replace-self status context that describes relay availability and the existing generic relay tool.
 */
export class MinecraftContextService {
  private runtimeBot: MinecraftContextBot | null = null
  private currentSnapshot: MinecraftStatusSnapshot | null = null
  private lastPublishedText = ''
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeModuleAnnounced: (() => void) | null = null
  private readonly serverHost: string
  private readonly serverPort: number

  private readonly masterUsername?: string

  constructor(private readonly deps: {
    airiBridge: MinecraftContextBridge
    serverHost: string
    serverPort: number
    masterUsername?: string
    refreshIntervalMs?: number
  }) {
    this.serverHost = deps.serverHost
    this.serverPort = deps.serverPort
    this.masterUsername = deps.masterUsername
  }

  init() {
    if (this.unsubscribeModuleAnnounced) {
      return
    }

    this.unsubscribeModuleAnnounced = this.deps.airiBridge.onModuleAnnounced((event) => {
      const destinations = collectFrontendDestinations(event)
      if (destinations.length === 0) {
        return
      }

      this.publishStatus({ force: true, destinations })
    })
  }

  bindBot(bot: MinecraftContextBot) {
    this.runtimeBot = bot
    this.deps.airiBridge.setCommandAvailable(true)
    this.refreshStatusSnapshot()
    this.publishStatus({ force: true })

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }

    this.refreshTimer = setInterval(() => {
      this.publishStatus()
    }, this.deps.refreshIntervalMs ?? STATUS_REFRESH_INTERVAL_MS)
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
      this.publishStatus({ force: true })
  }

  publishStatus(options: { force?: boolean, destinations?: string[] } = {}) {
    const snapshot = this.refreshStatusSnapshot()
    const text = snapshot
      ? buildStatusText(snapshot)
      : buildOfflineStatusText(this.serverHost, this.serverPort, this.masterUsername)
    if (!options.force && text === this.lastPublishedText) {
      return
    }

    const update: ContextUpdate = {
      id: nanoid(),
      contextId: STATUS_CONTEXT_ID,
      lane: STATUS_LANE,
      text,
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
    this.lastPublishedText = text
  }

  getStatusSnapshot() {
    return this.currentSnapshot ? { ...this.currentSnapshot, otherPlayers: [...this.currentSnapshot.otherPlayers] } : null
  }

  destroy() {
    this.unbindBot()
    this.unsubscribeModuleAnnounced?.()
    this.unsubscribeModuleAnnounced = null
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
