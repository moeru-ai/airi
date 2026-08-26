import type { CommandContext } from './command'

export interface Context {
  command?: CommandContext
  time: number
}

export interface EventHandlers {
  'command': (ctx: Context) => Promise<void> | void
  'interrupt': () => void
  'time:midnight': (ctx: Context) => void
  'time:noon': (ctx: Context) => void
  'time:sunrise': (ctx: Context) => void
  'time:sunset': (ctx: Context) => void
}

export type Events = keyof EventHandlers
export type EventsHandler<K extends Events> = EventHandlers[K]
export type Handler = (ctx: Context) => Promise<void> | void

export interface OneLinerable {
  toOneLiner: () => string
}
