import type { Mineflayer } from './core'
import type { OneLinerable } from './types'

export class Status implements OneLinerable {
  public position: string
  public health: string
  public weather: string
  public timeOfDay: string

  constructor() {
    this.position = ''
    this.health = ''
    this.weather = ''
    this.timeOfDay = ''
  }

  public update(mineflayer: Mineflayer) {
    if (!mineflayer.ready)
      return

    Object.assign(this, Status.from(mineflayer))
  }

  static from(mineflayer: Mineflayer): Status {
    if (!mineflayer.ready)
      return new Status()

    const pos = mineflayer.bot.entity.position
    const weather = mineflayer.bot.isRaining ? 'Rain' : mineflayer.bot.thunderState ? 'Thunderstorm' : 'Clear'
    const timeOfDay = mineflayer.bot.time.timeOfDay < 6000
      ? 'Morning'
      : mineflayer.bot.time.timeOfDay < 12000 ? 'Afternoon' : 'Night'

    const status = new Status()
    status.position = `x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)}`
    status.health = `${Math.round(mineflayer.bot.health)} / 20`
    status.weather = weather
    status.timeOfDay = timeOfDay

    return status
  }

  public toOneLiner(): string {
    return Object.entries(this).map(([key, value]) => `${key}: ${value}`).join('\n')
  }
}
