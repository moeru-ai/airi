import type { Config } from './composables/config'

import EventEmitter from 'eventemitter3'

interface BotLifecycleEvents {
  'bot:connected': () => void
  'bot:disconnected': (reason?: string) => void
  'bot:error': (error: Error) => void
}

interface BotWithLifecycle {
  bot: {
    off?: (event: 'end' | 'error' | 'kicked' | 'spawn', listener: (...args: any[]) => void) => void
    on: (event: 'end' | 'error' | 'kicked' | 'spawn', listener: (...args: any[]) => void) => void
  }
  stop: () => Promise<void>
}

export class MinecraftBotRuntime extends EventEmitter<BotLifecycleEvents> {
  private bot: BotWithLifecycle | null = null
  private currentConfig: Config['bot']

  constructor(private readonly deps: {
    createBot: (config: Config['bot']) => Promise<BotWithLifecycle>
    initialConfig: Config['bot']
  }) {
    super()
    this.currentConfig = deps.initialConfig
  }

  async initialize() {
    this.bot = await this.deps.createBot(this.currentConfig)
    this.attachLifecycle(this.bot)
  }

  async stop() {
    if (!this.bot)
      return

    const activeBot = this.bot
    this.detachLifecycle(activeBot)
    this.bot = null
    await activeBot.stop()
  }

  async updateBotConfig(config: Config['bot']) {
    const previousBot = this.bot
    if (previousBot) {
      this.detachLifecycle(previousBot)
      await previousBot.stop()
    }

    this.currentConfig = config
    this.bot = await this.deps.createBot(this.currentConfig)
    this.attachLifecycle(this.bot)
  }

  private attachLifecycle(bot: BotWithLifecycle) {
    const lifecycleSource = bot.bot
    lifecycleSource.on('spawn', this.onSpawn)
    lifecycleSource.on('end', this.onEnd)
    lifecycleSource.on('kicked', this.onEnd)
    lifecycleSource.on('error', this.onError)
  }

  private detachLifecycle(bot: BotWithLifecycle) {
    const lifecycleSource = bot.bot
    lifecycleSource.off?.('spawn', this.onSpawn)
    lifecycleSource.off?.('end', this.onEnd)
    lifecycleSource.off?.('kicked', this.onEnd)
    lifecycleSource.off?.('error', this.onError)
  }

  private readonly onEnd = (reason?: string) => {
    this.emit('bot:disconnected', reason)
  }

  private readonly onError = (error: Error) => {
    this.emit('bot:error', error)
  }

  private readonly onSpawn = () => {
    this.emit('bot:connected')
  }
}
