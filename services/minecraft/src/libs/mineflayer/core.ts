import type { Logg } from '@guiiai/logg'
import type { Bot, BotOptions } from 'mineflayer'

import type { ConnectionSupervisor } from './connection-supervisor'
import type { MineflayerPlugin } from './plugin'
import type { PluginRuntime } from './plugin-runtime'
import type { TickEvents, TickEventsHandler } from './ticker'
import type { EventHandlers, EventsHandler } from './types'

import EventEmitter from 'eventemitter3'
import mineflayer from 'mineflayer'

import { useLogg } from '@guiiai/logg'

import { parseCommand } from './command'
import { Components } from './components'
import { createConnectionSupervisor } from './connection-supervisor'
import { Health } from './health'
import { Memory } from './memory'
import { ChatMessageHandler } from './message'
import { createPluginRuntime } from './plugin-runtime'
import { Status } from './status'
import { Ticker } from './ticker'

export interface MineflayerOptions {
  botConfig: BotOptions
  plugins?: Array<MineflayerPlugin>
  reconnect?: {
    enabled?: boolean
    maxRetries?: number
  }
}

export class Mineflayer extends EventEmitter<EventHandlers> {
  public bot: Bot
  public username: string
  public health: Health = new Health()
  public ready: boolean = false
  public components: Components = new Components()
  public status: Status = new Status()
  public memory: Memory = new Memory()

  public isCreative: boolean = false
  public allowCheats: boolean = false

  private respawnRequestedAt: number | null = null
  private respawnTimer: ReturnType<typeof setTimeout> | null = null
  private isStopping: boolean = false
  private hasSpawnedAtLeastOnce: boolean = false
  private pluginSetupPromise: Promise<void> = Promise.resolve()

  private options: MineflayerOptions
  private readonly pluginRuntime: PluginRuntime
  private readonly connectionSupervisor: ConnectionSupervisor
  private logger: Logg
  private commands: Map<string, EventsHandler<'command'>> = new Map()
  private ticker: Ticker = new Ticker()
  private readonly commandChatHandler: (username: string, message: string) => void

  constructor(options: MineflayerOptions) {
    super()
    this.options = options
    this.bot = mineflayer.createBot(options.botConfig)
    this.username = options.botConfig.username
    this.logger = useLogg(`Bot:${this.username}`).useGlobalConfig()

    this.pluginRuntime = createPluginRuntime({
      logger: this.logger,
      mineflayer: this,
      botConfig: this.options.botConfig,
      initialPlugins: options.plugins ?? [],
    })

    this.connectionSupervisor = createConnectionSupervisor({
      logger: this.logger,
      reconnect: this.options.reconnect,
      replaceBot: async () => {
        await this.replaceBot()
      },
    })

    this.commandChatHandler = this.createCommandChatHandler()

    this.on('interrupt', () => {
      this.logger.log('Interrupted')
    })
  }

  public interrupt(reason?: string) {
    this.logger.withFields({ reason }).log('Interrupt requested')

    try {
      ;(this.bot).pathfinder?.stop?.()
    }
    catch { }

    try {
      ;(this.bot).pvp?.stop?.()
    }
    catch { }

    try {
      ;(this.bot).stopDigging?.()
    }
    catch { }

    try {
      ;(this.bot).deactivateItem?.()
    }
    catch { }

    try {
      if (typeof this.bot.clearControlStates === 'function') {
        this.bot.clearControlStates()
      }
      else {
        ;(['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'] as const).forEach((control) => {
          this.bot.setControlState(control as any, false)
        })
      }
    }
    catch { }

    this.logger.withFields({ reason }).log('Interrupted')
    this.emit('interrupt')
  }

  public static async asyncBuild(options: MineflayerOptions) {
    const mineflayer = new Mineflayer(options)

    mineflayer.activateBot(mineflayer.bot)
    await mineflayer.pluginSetupPromise

    mineflayer.ticker.on('tick', () => {
      mineflayer.status.update(mineflayer)
      mineflayer.isCreative = mineflayer.bot.game?.gameMode === 'creative'
      mineflayer.allowCheats = false
    })

    return mineflayer
  }

  public async loadPlugin(plugin: MineflayerPlugin) {
    await this.pluginRuntime.loadPlugin(plugin)
  }

  public onCommand(commandName: string, cb: EventsHandler<'command'>) {
    this.commands.set(commandName, cb)
  }

  public onTick(event: TickEvents, cb: TickEventsHandler<TickEvents>) {
    this.ticker.on(event, cb)
  }

  public offTick(event: TickEvents, cb: TickEventsHandler<TickEvents>) {
    this.ticker.off(event, cb)
  }

  public async stop() {
    if (this.isStopping)
      return

    this.isStopping = true
    this.connectionSupervisor.stop()

    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer)
      this.respawnTimer = null
    }

    this.ticker.stop()

    await this.pluginRuntime.beforeCleanup()
    this.components.cleanup()
    this.detachCommandChatListener()
    this.bot.removeAllListeners()

    try {
      this.bot.quit()
    }
    catch { }

    this.removeAllListeners()
  }

  private activateBot(bot: Bot): void {
    this.bot = bot
    this.setupBotEventHandlers(bot)

    const setupPromise = this.pluginRuntime.initializeGeneration(bot)
    void setupPromise.catch((error) => {
      this.logger.errorWithError('Plugin runtime initialization failed', error as Error)
    })

    this.pluginSetupPromise = setupPromise
  }

  private async replaceBot(): Promise<void> {
    this.ready = false

    await this.pluginRuntime.beforeCleanup()
    this.detachCommandChatListener()

    const previousBot = this.bot
    previousBot.removeAllListeners()

    try {
      previousBot.quit()
    }
    catch { }

    const nextBot = mineflayer.createBot(this.options.botConfig)
    this.activateBot(nextBot)
  }

  private setupBotEventHandlers(bot: Bot): void {
    let disconnectForwarded = false
    let hasSpawnedForCurrentBot = false

    const forwardDisconnect = (reason: string): void => {
      if (this.isStopping || bot !== this.bot)
        return

      if (disconnectForwarded) {
        this.logger.withFields({ reason }).log('Disconnect ignored: already handling current bot disconnect')
        return
      }

      disconnectForwarded = true

      void Promise.resolve(this.connectionSupervisor.onDisconnect(reason)).catch((error) => {
        this.logger.errorWithError('Reconnect transition failed', error as Error)
      })
    }

    bot.once('resourcePack', () => {
      if (bot !== this.bot)
        return

      bot.acceptResourcePack()
    })

    bot.on('time', () => {
      if (bot !== this.bot)
        return

      if (bot.time.timeOfDay === 0)
        this.emit('time:sunrise', { time: bot.time.timeOfDay })
      else if (bot.time.timeOfDay === 6000)
        this.emit('time:noon', { time: bot.time.timeOfDay })
      else if (bot.time.timeOfDay === 12000)
        this.emit('time:sunset', { time: bot.time.timeOfDay })
      else if (bot.time.timeOfDay === 18000)
        this.emit('time:midnight', { time: bot.time.timeOfDay })
    })

    bot.on('health', () => {
      if (bot !== this.bot)
        return

      this.logger.withFields({
        health: this.health.value,
        lastDamageTime: this.health.lastDamageTime,
        lastDamageTaken: this.health.lastDamageTaken,
        previousHealth: bot.health,
      }).log('Health updated')

      if (bot.health < this.health.value) {
        this.health.lastDamageTime = Date.now()
        this.health.lastDamageTaken = this.health.value - bot.health
      }

      this.health.value = bot.health
    })

    bot.on('spawn', () => {
      if (bot !== this.bot)
        return

      disconnectForwarded = false
      this.ready = true
      this.respawnRequestedAt = null

      if (this.respawnTimer) {
        clearTimeout(this.respawnTimer)
        this.respawnTimer = null
      }

      this.attachCommandChatListener()

      if (!hasSpawnedForCurrentBot) {
        hasSpawnedForCurrentBot = true
        this.logger.log(this.hasSpawnedAtLeastOnce ? 'Bot ready (reconnected)' : 'Bot ready')
        this.hasSpawnedAtLeastOnce = true
      }

      void this.onBotSpawn(bot)
    })

    bot.on('death', () => {
      if (bot !== this.bot)
        return

      this.logger.error('Bot died')

      const now = Date.now()
      if (this.respawnRequestedAt && now - this.respawnRequestedAt < 3000)
        return

      this.respawnRequestedAt = now
      if (this.respawnTimer)
        clearTimeout(this.respawnTimer)

      this.respawnTimer = setTimeout(() => {
        this.respawnTimer = null

        if (bot !== this.bot || !this.bot._client)
          return

        try {
          bot.respawn()
          this.logger.log('Respawn requested')
        }
        catch (err) {
          this.logger.errorWithError('Failed to respawn', err as Error)
        }
      }, 750)
    })

    bot.on('kicked', (reason: string) => {
      if (bot !== this.bot)
        return

      this.logger.withFields({ reason }).error('Bot was kicked')
      forwardDisconnect('kicked')
    })

    bot.on('end', (reason) => {
      if (bot !== this.bot)
        return

      this.logger.withFields({ reason }).log('Bot ended')
      forwardDisconnect(reason ?? 'end')
    })

    bot.on('error', (err: Error) => {
      if (bot !== this.bot)
        return

      this.logger.errorWithError('Bot error:', err)
    })
  }

  private async onBotSpawn(bot: Bot): Promise<void> {
    if (bot !== this.bot || this.isStopping)
      return

    try {
      await this.pluginSetupPromise
    }
    catch (error) {
      this.logger.errorWithError('Skipping spawned hooks: plugin runtime initialization failed', error as Error)
      await Promise.resolve(this.connectionSupervisor.onDisconnect('plugin-setup-failed')).catch((disconnectError) => {
        this.logger.errorWithError('Reconnect transition failed', disconnectError as Error)
      })
      return
    }

    if (bot !== this.bot || this.isStopping)
      return

    try {
      await this.pluginRuntime.onSpawn()
    }
    catch (error) {
      this.logger.errorWithError('Plugin spawned hook failed', error as Error)
      await Promise.resolve(this.connectionSupervisor.onDisconnect('spawned-hook-failed')).catch((disconnectError) => {
        this.logger.errorWithError('Reconnect transition failed', disconnectError as Error)
      })
      return
    }

    if (bot !== this.bot || this.isStopping)
      return

    this.connectionSupervisor.onSpawn()
  }

  private attachCommandChatListener(): void {
    this.bot.off('chat', this.commandChatHandler)
    this.bot.on('chat', this.commandChatHandler)
  }

  private detachCommandChatListener(): void {
    this.bot.off('chat', this.commandChatHandler)
  }

  private createCommandChatHandler() {
    return new ChatMessageHandler(this.username).handleChat((sender, message) => {
      const { isCommand, command, args } = parseCommand(sender, message)

      if (!isCommand)
        return

      // Remove the # prefix from command
      const cleanCommand = command.slice(1)
      this.logger.withFields({ sender, command: cleanCommand, args }).log('Command received')

      const handler = this.commands.get(cleanCommand)
      if (handler) {
        handler({ time: this.bot.time.timeOfDay, command: { sender, isCommand, command: cleanCommand, args } })
        return
      }

      // Built-in commands
      switch (cleanCommand) {
        case 'help': {
          const commandList = Array.from(this.commands.keys()).concat(['help'])
          this.bot.chat(`Available commands: ${commandList.map(cmd => `#${cmd}`).join(', ')}`)
          break
        }
        default:
          this.bot.chat(`Unknown command: ${cleanCommand}`)
      }
    })
  }
}
