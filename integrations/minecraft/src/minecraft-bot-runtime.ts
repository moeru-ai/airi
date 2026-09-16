import type { Config } from './composables/config'

import EventEmitter from 'eventemitter3'

interface BotLifecycleEvents {
  'bot:connected': () => void
  'bot:disconnected': (reason?: string) => void
  'bot:error': (error: Error) => void
}

interface BotWithLifecycle {
  bot: {
    on: (event: 'spawn' | 'end' | 'error' | 'kicked', listener: (...args: any[]) => void) => void
    off?: (event: 'spawn' | 'end' | 'error' | 'kicked', listener: (...args: any[]) => void) => void
  }
  stop: () => Promise<void>
}

export class MinecraftBotRuntime extends EventEmitter<BotLifecycleEvents> {
  private bot: BotWithLifecycle | null = null
  private currentConfig: Config['bot']

  private readonly onSpawn = () => {
    this.emit('bot:connected')
  }

  private readonly onEnd = (reason?: string) => {
    this.emit('bot:disconnected', reason)
  }

  private readonly onError = (error: Error) => {
    this.emit('bot:error', error)
  }

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

  async stop() {
    if (!this.bot)
      return

    const activeBot = this.bot
    this.detachLifecycle(activeBot)
    this.bot = null
    await activeBot.stop()
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
}
