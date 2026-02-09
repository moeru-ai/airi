import type { Logg } from '@guiiai/logg'
import type { Bot, BotOptions } from 'mineflayer'

import type { MineflayerPlugin } from './plugin'
import type { TickEvents, TickEventsHandler } from './ticker'
import type { EventHandlers, EventsHandler } from './types'

import EventEmitter from 'eventemitter3'
import mineflayer from 'mineflayer'

import { useLogg } from '@guiiai/logg'

import { parseCommand } from './command'
import { Components } from './components'
import { Health } from './health'
import { Memory } from './memory'
import { ChatMessageHandler } from './message'
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
  private reconnectAttempts: number = 0
  private isReconnecting: boolean = false
  private isStopping: boolean = false

  private options: MineflayerOptions
  private logger: Logg
  private commands: Map<string, EventsHandler<'command'>> = new Map()
  private ticker: Ticker = new Ticker()

  constructor(options: MineflayerOptions) {
    super()
    this.options = options
    this.bot = mineflayer.createBot(options.botConfig)
    this.username = options.botConfig.username
    this.logger = useLogg(`Bot:${this.username}`).useGlobalConfig()

    this.on('interrupt', () => {
      this.logger.log('Interrupted')
    })
  }

  public interrupt(reason?: string) {
    this.logger.withFields({ reason }).log('Interrupt requested')

    try {
      (this.bot).pathfinder?.stop?.()
    }
    catch { }

    try {
      (this.bot).pvp?.stop?.()
    }
    catch { }

    try {
      ; (this.bot).stopDigging?.()
    }
    catch { }

    try {
      ; (this.bot).deactivateItem?.()
    }
    catch { }

    try {
      if (typeof this.bot.clearControlStates === 'function') {
        this.bot.clearControlStates()
      }
      else {
        ; (['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak'] as const).forEach((control) => {
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

    mineflayer.bot.once('resourcePack', () => {
      mineflayer.bot.acceptResourcePack()
    })

    mineflayer.bot.on('time', () => {
      if (mineflayer.bot.time.timeOfDay === 0)
        mineflayer.emit('time:sunrise', { time: mineflayer.bot.time.timeOfDay })
      else if (mineflayer.bot.time.timeOfDay === 6000)
        mineflayer.emit('time:noon', { time: mineflayer.bot.time.timeOfDay })
      else if (mineflayer.bot.time.timeOfDay === 12000)
        mineflayer.emit('time:sunset', { time: mineflayer.bot.time.timeOfDay })
      else if (mineflayer.bot.time.timeOfDay === 18000)
        mineflayer.emit('time:midnight', { time: mineflayer.bot.time.timeOfDay })
    })

    mineflayer.bot.on('health', () => {
      mineflayer.logger.withFields({
        health: mineflayer.health.value,
        lastDamageTime: mineflayer.health.lastDamageTime,
        lastDamageTaken: mineflayer.health.lastDamageTaken,
        previousHealth: mineflayer.bot.health,
      }).log('Health updated')

      if (mineflayer.bot.health < mineflayer.health.value) {
        mineflayer.health.lastDamageTime = Date.now()
        mineflayer.health.lastDamageTaken = mineflayer.health.value - mineflayer.bot.health
      }

      mineflayer.health.value = mineflayer.bot.health
    })

    mineflayer.bot.once('spawn', () => {
      mineflayer.ready = true
      mineflayer.logger.log('Bot ready')
    })

    mineflayer.bot.on('spawn', () => {
      mineflayer.respawnRequestedAt = null
      if (mineflayer.respawnTimer) {
        clearTimeout(mineflayer.respawnTimer)
        mineflayer.respawnTimer = null
      }
    })

    mineflayer.bot.on('death', () => {
      mineflayer.logger.error('Bot died')

      const now = Date.now()
      if (mineflayer.respawnRequestedAt && now - mineflayer.respawnRequestedAt < 3000)
        return

      mineflayer.respawnRequestedAt = now
      if (mineflayer.respawnTimer)
        clearTimeout(mineflayer.respawnTimer)

      mineflayer.respawnTimer = setTimeout(() => {
        mineflayer.respawnTimer = null

        if (!mineflayer.bot || !mineflayer.bot._client)
          return

        try {
          mineflayer.bot.respawn()
          mineflayer.logger.log('Respawn requested')
        }
        catch (err) {
          mineflayer.logger.errorWithError('Failed to respawn', err as Error)
        }
      }, 750)
    })

    mineflayer.bot.on('kicked', (reason: string) => {
      mineflayer.logger.withFields({ reason }).error('Bot was kicked')
      mineflayer.tryReconnect('kicked')
    })

    mineflayer.bot.on('end', (reason) => {
      mineflayer.logger.withFields({ reason }).log('Bot ended')
      mineflayer.tryReconnect(reason ?? 'end')
    })

    mineflayer.bot.on('error', (err: Error) => {
      mineflayer.logger.errorWithError('Bot error:', err)
    })

    mineflayer.bot.on('spawn', () => {
      mineflayer.bot.on('chat', mineflayer.handleCommand())
    })

    mineflayer.bot.on('spawn', async () => {
      for (const plugin of options?.plugins || []) {
        if (plugin.spawned) {
          await plugin.spawned(mineflayer)
        }
      }
    })

    for (const plugin of options?.plugins || []) {
      if (plugin.created) {
        await plugin.created(mineflayer)
      }
    }

    // Load Plugins
    for (const plugin of options?.plugins || []) {
      if (plugin.loadPlugin) {
        mineflayer.bot.loadPlugin(await plugin.loadPlugin(mineflayer, mineflayer.bot, options.botConfig))
      }
    }

    mineflayer.ticker.on('tick', () => {
      mineflayer.status.update(mineflayer)
      mineflayer.isCreative = mineflayer.bot.game?.gameMode === 'creative'
      mineflayer.allowCheats = false
    })

    return mineflayer
  }

  public async loadPlugin(plugin: MineflayerPlugin) {
    if (plugin.created)
      await plugin.created(this)

    if (plugin.loadPlugin) {
      this.bot.loadPlugin(await plugin.loadPlugin(this, this.bot, this.options.botConfig))
    }

    if (plugin.spawned)
      this.bot.once('spawn', () => plugin.spawned?.(this))
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
    this.isStopping = true

    for (const plugin of this.options?.plugins || []) {
      if (plugin.beforeCleanup) {
        await plugin.beforeCleanup(this)
      }
    }
    this.components.cleanup()
    this.bot.removeListener('chat', this.handleCommand())
    this.bot.quit()
    this.removeAllListeners()
  }

  private tryReconnect(reason: string) {
    const reconnectConfig = this.options.reconnect
    if (!reconnectConfig?.enabled || this.isStopping || this.isReconnecting) {
      return
    }

    const maxRetries = reconnectConfig.maxRetries ?? 5

    if (this.reconnectAttempts >= maxRetries) {
      this.logger.error(`Max reconnect attempts (${maxRetries}) reached. Giving up.`)
      return
    }

    this.reconnectAttempts++
    this.isReconnecting = true

    this.logger.withFields({
      reason,
      attempt: this.reconnectAttempts,
      maxRetries,
    }).log('Reconnecting...')

    try {
      // Clean up old bot
      this.ready = false
      this.bot.removeAllListeners()

      // Create new bot with same config
      this.bot = mineflayer.createBot(this.options.botConfig)

      // Re-register all event handlers
      this.setupBotEventHandlers()

      // Reload plugins (sync where possible)
      for (const plugin of this.options?.plugins || []) {
        if (plugin.created) {
          void plugin.created(this)
        }
      }

      for (const plugin of this.options?.plugins || []) {
        if (plugin.loadPlugin) {
          void Promise.resolve(plugin.loadPlugin(this, this.bot, this.options.botConfig)).then((p) => {
            this.bot.loadPlugin(p)
          })
        }
      }

      this.logger.log('Reconnect initiated, waiting for spawn...')
    }
    catch (err) {
      this.logger.errorWithError('Reconnect failed', err as Error)
      this.isReconnecting = false
    }
  }

  private setupBotEventHandlers() {
    this.bot.once('resourcePack', () => {
      this.bot.acceptResourcePack()
    })

    this.bot.on('time', () => {
      if (this.bot.time.timeOfDay === 0)
        this.emit('time:sunrise', { time: this.bot.time.timeOfDay })
      else if (this.bot.time.timeOfDay === 6000)
        this.emit('time:noon', { time: this.bot.time.timeOfDay })
      else if (this.bot.time.timeOfDay === 12000)
        this.emit('time:sunset', { time: this.bot.time.timeOfDay })
      else if (this.bot.time.timeOfDay === 18000)
        this.emit('time:midnight', { time: this.bot.time.timeOfDay })
    })

    this.bot.on('health', () => {
      if (this.bot.health < this.health.value) {
        this.health.lastDamageTime = Date.now()
        this.health.lastDamageTaken = this.health.value - this.bot.health
      }
      this.health.value = this.bot.health
    })

    this.bot.once('spawn', () => {
      this.ready = true
      this.reconnectAttempts = 0
      this.isReconnecting = false
      this.logger.log('Bot ready (reconnected)')
    })

    this.bot.on('spawn', () => {
      this.respawnRequestedAt = null
      if (this.respawnTimer) {
        clearTimeout(this.respawnTimer)
        this.respawnTimer = null
      }
    })

    this.bot.on('death', () => {
      this.logger.error('Bot died')

      const now = Date.now()
      if (this.respawnRequestedAt && now - this.respawnRequestedAt < 3000)
        return

      this.respawnRequestedAt = now
      if (this.respawnTimer)
        clearTimeout(this.respawnTimer)

      this.respawnTimer = setTimeout(() => {
        this.respawnTimer = null

        if (!this.bot || !this.bot._client)
          return

        try {
          this.bot.respawn()
          this.logger.log('Respawn requested')
        }
        catch (err) {
          this.logger.errorWithError('Failed to respawn', err as Error)
        }
      }, 750)
    })

    this.bot.on('kicked', (reason: string) => {
      this.logger.withFields({ reason }).error('Bot was kicked')
      this.tryReconnect('kicked')
    })

    this.bot.on('end', (reason) => {
      this.logger.withFields({ reason }).log('Bot ended')
      this.tryReconnect(reason ?? 'end')
    })

    this.bot.on('error', (err: Error) => {
      this.logger.errorWithError('Bot error:', err)
    })

    this.bot.on('spawn', () => {
      this.bot.on('chat', this.handleCommand())
    })

    this.bot.on('spawn', async () => {
      for (const plugin of this.options?.plugins || []) {
        if (plugin.spawned) {
          await plugin.spawned(this)
        }
      }
    })
  }

  private handleCommand() {
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
