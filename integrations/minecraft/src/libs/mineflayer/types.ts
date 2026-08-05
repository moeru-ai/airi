import type { CommandContext } from './command'

export interface Context {
  time: number
  command?: CommandContext
}

export interface EventHandlers {
  'interrupt': () => void
  'command': (ctx: Context) => void | Promise<void>
  'time:sunrise': (ctx: Context) => void
  'time:noon': (ctx: Context) => void
  'time:sunset': (ctx: Context) => void
  'time:midnight': (ctx: Context) => void
}

export type Events = keyof EventHandlers
export type EventsHandler<K extends Events> = EventHandlers[K]
export type Handler = (ctx: Context) => void | Promise<void>

export interface OneLinerable {
  toOneLiner: () => string
}
