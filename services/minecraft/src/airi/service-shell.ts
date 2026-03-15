import type { MinecraftEditableConfig, MinecraftRuntimeConfigManager, MinecraftRuntimeConfigSnapshot } from '../composables/runtime-config'

interface BotLike {
  updateBotConfig: (config: MinecraftRuntimeConfigSnapshot['effectiveBotConfig']) => Promise<void>
  stop: () => Promise<void>
}

interface AiriClientLike {
  onEvent: (event: 'module:configure', handler: (event: { data: { config?: unknown } }) => void | Promise<void>) => void
}

export class MinecraftServiceShell {
  private bot: BotLike | null = null
  private snapshot!: MinecraftRuntimeConfigSnapshot

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
  }

  private async applyConfig(nextConfig: unknown) {
    try {
      const editableConfig = nextConfig as MinecraftEditableConfig
      const nextSnapshot = this.deps.configManager.save(editableConfig)
      this.snapshot = nextSnapshot

      if (!nextSnapshot.editableConfig.enabled) {
        if (this.bot) {
          await this.bot.stop()
          this.bot = null
        }
        return
      }

      if (!this.bot) {
        await this.ensureBot()
        return
      }

      await this.bot.updateBotConfig(nextSnapshot.effectiveBotConfig)
    }
    catch {
      // Keep failures local to the service process. Stage learns only from registry liveness
      // and explicit bot-originated context pushes, not automated service-shell updates.
    }
  }

  private async ensureBot() {
    if (this.bot)
      return

    this.bot = await this.deps.createBot(this.snapshot.effectiveBotConfig)
  }
}
