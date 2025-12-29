import type { BotEvent, EventCategory } from '../types'

import EventEmitter from 'eventemitter3'

export class EventManager {
  private emitter = new EventEmitter()

  public emit<T>(event: BotEvent<T>): void {
    // TODO: Temporal Context tracking
    // TODO: Salience Detection / Filtering noise

    // Sort/Filter logic could go here in the future
    if (!event.priority) {
      event.priority = 0 // Default priority
    }

    this.emitter.emit(event.type, event)
    this.emitter.emit('*', event)
  }

  public on<T>(type: EventCategory | '*', handler: (event: BotEvent<T>) => void): void {
    this.emitter.on(type, handler)
  }

  public off<T>(type: EventCategory | '*', handler: (event: BotEvent<T>) => void): void {
    this.emitter.off(type, handler)
  }

  public once<T>(type: EventCategory | '*', handler: (event: BotEvent<T>) => void): void {
    this.emitter.once(type, handler)
  }
}
