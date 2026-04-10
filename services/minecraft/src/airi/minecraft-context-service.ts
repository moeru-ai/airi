import type { ContextUpdate, ModuleAnnouncedEvent } from '@proj-airi/server-sdk'

import type { MineflayerWithAgents } from '../cognitive/types'
import type { AiriBridge } from './airi-bridge'

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
}

const STATUS_CONTEXT_ID = 'minecraft:status'
const STATUS_LANE = 'minecraft:status'
const STATUS_REFRESH_INTERVAL_MS = 5_000

function toPositionString(bot: MineflayerWithAgents) {
  const position = bot.bot.entity?.position
  return position
    ? `x: ${position.x.toFixed(1)}, y: ${position.y.toFixed(1)}, z: ${position.z.toFixed(1)}`
    : 'unknown'
}

function buildStatusText(snapshot: MinecraftStatusSnapshot) {
  return [
    `Bot online: ${snapshot.botUsername}`,
    `Server: ${snapshot.serverHost}:${snapshot.serverPort}`,
    `Position: ${snapshot.position}`,
    `Health: ${snapshot.health}/20, Mode: ${snapshot.gameMode}`,
    `Other players online: ${snapshot.otherPlayers.length > 0 ? snapshot.otherPlayers.join(', ') : 'none'}`,
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

export class MinecraftContextService {
  private runtimeBot: MineflayerWithAgents | null = null
  private currentSnapshot: MinecraftStatusSnapshot | null = null
  private lastPublishedText = ''
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeModuleAnnounced: (() => void) | null = null
  private readonly serverHost: string
  private readonly serverPort: number

  constructor(private readonly deps: {
    airiBridge: Pick<AiriBridge, 'onModuleAnnounced' | 'sendContextUpdate'>
    serverHost: string
    serverPort: number
    refreshIntervalMs?: number
  }) {
    this.serverHost = deps.serverHost
    this.serverPort = deps.serverPort
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

  bindBot(bot: MineflayerWithAgents) {
    this.runtimeBot = bot
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
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    this.runtimeBot = null
    this.currentSnapshot = null
    this.lastPublishedText = ''
  }

  publishStatus(options: { force?: boolean, destinations?: string[] } = {}) {
    const snapshot = this.refreshStatusSnapshot()
    if (!snapshot) {
      return
    }

    const text = buildStatusText(snapshot)
    if (!options.force && text === this.lastPublishedText) {
      return
    }

    const update: ContextUpdate = {
      id: nanoid(),
      contextId: STATUS_CONTEXT_ID,
      lane: STATUS_LANE,
      text,
      hints: ['status', snapshot.botUsername],
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
    }

    return this.currentSnapshot
  }
}
