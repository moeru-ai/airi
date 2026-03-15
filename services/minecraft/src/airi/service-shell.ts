import type { MinecraftEditableConfig, MinecraftRuntimeConfigManager, MinecraftRuntimeConfigSnapshot } from '../composables/runtime-config'

import { nanoid } from 'nanoid'

type BotState = 'connecting' | 'connected' | 'disconnected' | 'error'

interface BotLike {
  on: (event: 'bot:connected' | 'bot:disconnected' | 'bot:error', handler: (payload?: unknown) => void) => void
  off?: (event: 'bot:connected' | 'bot:disconnected' | 'bot:error', handler: (payload?: unknown) => void) => void
  updateBotConfig: (config: MinecraftRuntimeConfigSnapshot['effectiveBotConfig']) => Promise<void>
  stop: () => Promise<void>
}

interface AiriClientLike {
  onEvent: (event: 'module:configure', handler: (event: { data: { config?: unknown } }) => void | Promise<void>) => void
  send: (...args: any[]) => void
}

export class MinecraftServiceShell {
  private bot: BotLike | null = null
  private snapshot!: MinecraftRuntimeConfigSnapshot
  private botState: BotState = 'disconnected'
  private lastError?: string
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private readonly onBotConnected = () => {
    this.botState = 'connected'
    this.lastError = undefined
    this.emitStatus()
  }

  private readonly onBotDisconnected = (payload?: unknown) => {
    this.botState = 'disconnected'
    this.lastError = payload instanceof Error ? payload.message : typeof payload === 'string' ? payload : undefined
    this.emitStatus()
  }

  private readonly onBotError = (payload?: unknown) => {
    this.botState = 'error'
    this.lastError = payload instanceof Error ? payload.message : typeof payload === 'string' ? payload : 'Minecraft bot error'
    this.emitStatus()
  }

  constructor(private readonly deps: {
    airiClient: AiriClientLike
    configManager: Pick<MinecraftRuntimeConfigManager, 'load' | 'save'>
    createBot: (config: MinecraftRuntimeConfigSnapshot['effectiveBotConfig']) => Promise<BotLike>
    heartbeatMs?: number
    now?: () => number
    serviceName?: string
  }) {}

  async initialize() {
    this.snapshot = this.deps.configManager.load()

    this.deps.airiClient.onEvent('module:configure', async (event) => {
      await this.applyConfig(event.data.config)
    })

    if (this.snapshot.editableConfig.enabled) {
      await this.ensureBot()
    }
    else {
      this.botState = 'disconnected'
      this.emitStatus()
    }

    this.startHeartbeat()
  }

  private async applyConfig(nextConfig: unknown) {
    try {
      const editableConfig = nextConfig as MinecraftEditableConfig
      const nextSnapshot = this.deps.configManager.save(editableConfig)
      this.snapshot = nextSnapshot
      this.lastError = undefined

      if (!nextSnapshot.editableConfig.enabled) {
        if (this.bot) {
          await this.bot.stop()
          this.bot = null
        }
        this.botState = 'disconnected'
        this.emitStatus()
        return
      }

      if (!this.bot) {
        await this.ensureBot()
        return
      }

      this.botState = 'connecting'
      await this.bot.updateBotConfig(nextSnapshot.effectiveBotConfig)
      this.emitStatus()
    }
    catch (error) {
      this.botState = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
      this.emitStatus()
    }
  }

  private async ensureBot() {
    if (this.bot)
      return

    this.bot = await this.deps.createBot(this.snapshot.effectiveBotConfig)
    this.bot.on('bot:connected', this.onBotConnected)
    this.bot.on('bot:disconnected', this.onBotDisconnected)
    this.bot.on('bot:error', this.onBotError)

    this.botState = 'connecting'
    this.emitStatus()
  }

  private startHeartbeat() {
    const heartbeatMs = this.deps.heartbeatMs ?? 15_000
    if (this.heartbeatTimer)
      clearInterval(this.heartbeatTimer)

    this.heartbeatTimer = setInterval(() => {
      this.emitStatus()
    }, heartbeatMs)
  }

  private emitStatus() {
    const now = this.deps.now?.() ?? Date.now()
    const serviceName = this.deps.serviceName ?? 'minecraft-bot'
    const { editableConfig } = this.snapshot

    this.deps.airiClient.send({
      type: 'context:update',
      data: {
        id: nanoid(),
        contextId: `minecraft-status:${serviceName}`,
        lane: 'minecraft:status',
        strategy: 'replace-self',
        text: [
          `Minecraft service ${serviceName}`,
          `Bot state: ${this.botState}`,
          `Target: ${editableConfig.host}:${editableConfig.port}`,
          `Username: ${editableConfig.username}`,
          this.lastError ? `Last error: ${this.lastError}` : '',
        ].filter(Boolean).join('\n'),
        content: {
          serviceName,
          botState: this.botState,
          editableConfig,
          host: editableConfig.host,
          port: editableConfig.port,
          botUsername: editableConfig.username,
          lastError: this.lastError,
          updatedAt: now,
        },
      },
    })
  }
}
