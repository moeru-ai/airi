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
      this.bot.chat('Interrupted')
    })
  }

  public interrupt(reason?: string) {
    this.logger.withFields({ reason }).log('Interrupt requested')

    try {
      (this.bot as any).pathfinder?.stop?.()
    }
    catch { }

    try {
      (this.bot as any).pvp?.stop?.()
    }
    catch { }

    try {
      ; (this.bot as any).stopDigging?.()
    }
    catch { }

    try {
      ; (this.bot as any).deactivateItem?.()
    }
    catch { }

    try {
      if (typeof (this.bot as any).clearControlStates === 'function') {
        ; (this.bot as any).clearControlStates()
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

    mineflayer.bot.on('death', () => {
      mineflayer.logger.error('Bot died')
    })

    mineflayer.bot.on('kicked', (reason: string) => {
      mineflayer.logger.withFields({ reason }).error('Bot was kicked')
    })

    mineflayer.bot.on('end', (reason) => {
      mineflayer.logger.withFields({ reason }).log('Bot ended')
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

  public async stop() {
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
