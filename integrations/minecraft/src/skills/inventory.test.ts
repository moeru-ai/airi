import type { Bot } from 'mineflayer'
import type { Entity } from 'prismarine-entity'

import type { Mineflayer } from '../libs/mineflayer'

import { EventEmitter } from 'node:events'

import EventEmitter3 from 'eventemitter3'
import minecraftData from 'minecraft-data'
import prismarineItem from 'prismarine-item'

import { Vec3 } from 'vec3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { giveToPlayer } from './inventory'

const registry = minecraftData('1.21.4')
const Item = prismarineItem('1.21.4')

function entity(id: number, username?: string): Entity {
  const fields: Partial<Entity> = { id, username, position: new Vec3(0, 64, 0) }
  return fields as Entity
}

function fixture() {
  const recipient = entity(1, 'Alex')
  const bystander = entity(2, 'Bob')
  const drop = entity(3)
  const unrelatedDrop = entity(4)
  const secondUnrelatedDrop = entity(5)
  const bread = new Item(registry.itemsByName.bread.id, 1)
  const toss = vi.fn<Bot['toss']>().mockResolvedValue()
  const chat = vi.fn<Bot['chat']>()
  const inventory: Partial<Bot['inventory']> = { items: () => [bread] }
  const player: Partial<Bot['players'][string]> = { entity: recipient }
  const events = new EventEmitter()
  const fields: Partial<Bot> = {
    players: { Alex: player as Bot['players'][string] },
    inventory: inventory as Bot['inventory'],
    lookAt: vi.fn<Bot['lookAt']>().mockResolvedValue(),
    toss,
    chat,
  }
  const bot = fields as Bot
  bot.on = (event, listener) => {
    events.on(event, listener)
    return bot
  }
  bot.once = (event, listener) => {
    events.once(event, listener)
    return bot
  }
  bot.removeListener = (event, listener) => {
    events.removeListener(event, listener)
    return bot
  }
  bot.emit = (event, ...args) => events.emit(event, ...args)
  bot.listenerCount = event => events.listenerCount(event)
  // Use the public teleport navigation path with a stubbed network boundary.
  // No live bot or server is needed to exercise gift collection.
  const mineflayer = Object.assign(new EventEmitter3(), { bot, allowCheats: true }) as Mineflayer

  return { mineflayer, bot, recipient, bystander, drop, unrelatedDrop, secondUnrelatedDrop, bread, toss, chat }
}

function expectCleanedUp(mineflayer: Mineflayer) {
  expect(mineflayer.bot.listenerCount('playerCollect')).toBe(0)
  expect(mineflayer.listenerCount('interrupt')).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
}

describe('giveToPlayer collection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // ROOT CAUSE:
  // A once listener is removed even when an unrelated player collects an item.
  // Keep listening until the recipient collects, or the action ends.
  it('still accepts the recipient after another player collects an item', async () => {
    const { mineflayer, bot, recipient, bystander, drop, unrelatedDrop, bread, toss, chat } = fixture()
    const result = giveToPlayer(mineflayer, 'bread', 'Alex', 1)
    const assertion = expect(result).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(0)

    bot.emit('playerCollect', bystander, unrelatedDrop)
    bot.emit('playerCollect', recipient, drop)
    await Promise.all([assertion, vi.advanceTimersByTimeAsync(3000)])
    expect(toss).toHaveBeenCalledExactlyOnceWith(bread.type, null, 1)
    expect(chat).toHaveBeenCalledExactlyOnceWith('/tp @s Alex')
    expectCleanedUp(mineflayer)
  })

  it('resolves and removes listeners when the recipient collects first', async () => {
    const { mineflayer, bot, recipient, drop } = fixture()
    const result = giveToPlayer(mineflayer, 'bread', 'Alex', 1)
    await vi.advanceTimersByTimeAsync(0)

    bot.emit('playerCollect', recipient, drop)
    await expect(result).resolves.toBeUndefined()
    expectCleanedUp(mineflayer)
  })

  it('times out after repeated unrelated collections without extending the deadline', async () => {
    const { mineflayer, bot, bystander, unrelatedDrop, secondUnrelatedDrop } = fixture()
    const result = giveToPlayer(mineflayer, 'bread', 'Alex', 1)
    const assertion = expect(result).rejects.toMatchObject({ code: 'INTERRUPTED', message: expect.stringContaining('never received') })
    await vi.advanceTimersByTimeAsync(0)

    bot.emit('playerCollect', bystander, unrelatedDrop)
    await vi.advanceTimersByTimeAsync(2999)
    bot.emit('playerCollect', bystander, secondUnrelatedDrop)
    await vi.advanceTimersByTimeAsync(1)

    await assertion
    expectCleanedUp(mineflayer)
  })

  it('cancels after an unrelated collection and ignores later recipient events', async () => {
    const { mineflayer, bot, recipient, bystander, drop, unrelatedDrop } = fixture()
    const result = giveToPlayer(mineflayer, 'bread', 'Alex', 1)
    const assertion = expect(result).rejects.toMatchObject({ code: 'INTERRUPTED', message: expect.stringContaining('cancelled') })
    await vi.advanceTimersByTimeAsync(0)

    bot.emit('playerCollect', bystander, unrelatedDrop)
    mineflayer.emit('interrupt')
    bot.emit('playerCollect', recipient, drop)

    await assertion
    expectCleanedUp(mineflayer)
  })

  it('propagates toss failures without leaving collection listeners', async () => {
    const { mineflayer, toss } = fixture()
    toss.mockRejectedValueOnce(new Error('toss failed'))

    await expect(giveToPlayer(mineflayer, 'bread', 'Alex', 1)).rejects.toThrow('toss failed')
    expectCleanedUp(mineflayer)
  })

  it('reports missing items without tossing or leaving listeners', async () => {
    const { mineflayer, toss } = fixture()

    await expect(giveToPlayer(mineflayer, 'diamond', 'Alex', 1)).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' })
    expect(toss).not.toHaveBeenCalled()
    expectCleanedUp(mineflayer)
  })
})
