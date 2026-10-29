import type { Bot } from 'mineflayer'
import type { Item as InventoryItem } from 'prismarine-item'

import type { Mineflayer } from '../../libs/mineflayer/core'

import minecraftData from 'minecraft-data'
import prismarineBlock from 'prismarine-block'
import prismarineItem from 'prismarine-item'
import prismarineWindows from 'prismarine-windows'

import { Vec3 } from 'vec3'
import { describe, expect, it, vi } from 'vitest'

import { actionsList } from '../../cognitive/action/llm-actions'
import { putInChest, takeFromChest } from './inventory'

const version = '1.21.4'
const registry = minecraftData(version)
const Block = prismarineBlock(version)
const Item = prismarineItem(version)
const windows = prismarineWindows(version)

type Container = Awaited<ReturnType<Bot['openContainer']>>

interface Stack {
  name: string
  count: number
}

function createFixture({
  inventory = [],
  chest = [],
  openedInventory = inventory,
}: {
  inventory?: Stack[]
  chest?: Stack[]
  openedInventory?: Stack[]
} = {}) {
  const playerWindow = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
  const chestWindow = windows.createWindow(1, 'minecraft:generic_9x3', 'Chest')
  if (!playerWindow || !chestWindow)
    throw new Error('The fixture requires inventory and chest windows')

  const stack = ({ name, count }: Stack): InventoryItem => new Item(registry.itemsByName[name].id, count)
  for (const [index, item] of inventory.entries())
    playerWindow.updateSlot(playerWindow.inventoryStart + index, stack(item))
  for (const [index, item] of chest.entries())
    chestWindow.updateSlot(index, stack(item))
  for (const [index, item] of openedInventory.entries())
    chestWindow.updateSlot(chestWindow.inventoryStart + index, stack(item))

  const container = Object.assign(chestWindow, {
    deposit: vi.fn<Container['deposit']>().mockResolvedValue(undefined),
    withdraw: vi.fn<Container['withdraw']>().mockResolvedValue(undefined),
    close: vi.fn<Container['close']>(),
  })
  const openContainer = vi.fn<Bot['openContainer']>().mockResolvedValue(container)
  const chestPosition = new Vec3(1, 64, 0)
  const chestBlock = Block.fromStateId(registry.blocksByName.chest.defaultState, 0)
  chestBlock.position = chestPosition
  const entity: Pick<Bot['entity'], 'position'> = { position: new Vec3(0.5, 64, 0.5) }
  const bot: Pick<Bot, 'registry' | 'entity' | 'inventory' | 'openContainer' | 'blockAt' | 'findBlocks' | 'chat'> = {
    registry: registry as Bot['registry'],
    entity: entity as Bot['entity'],
    inventory: playerWindow,
    openContainer,
    blockAt: vi.fn<Bot['blockAt']>((position) => {
      if (position.equals(chestPosition))
        return chestBlock
      const blockType = position.y < 64 ? 'stone' : 'air'
      const block = Block.fromStateId(registry.blocksByName[blockType].defaultState, 0)
      block.position = new Vec3(position.x, position.y, position.z)
      return block
    }),
    findBlocks: vi.fn<Bot['findBlocks']>(() => [chestPosition.clone()]),
    chat: vi.fn<Bot['chat']>(),
  }
  const mineflayer = { bot: bot as Bot, allowCheats: true } as Mineflayer

  return { mineflayer, container, openContainer }
}

describe('putInChest', () => {
  it.each([
    { requested: 96, expected: 96 },
    { requested: 80, expected: 80 },
    { requested: 128, expected: 96 },
  ])('puts $expected items across stacks for a request of $requested', async ({ requested, expected }) => {
    const { mineflayer, container } = createFixture({
      inventory: [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 32 }],
    })

    const transferred = await putInChest(mineflayer, 'cobblestone', requested)

    expect(container.deposit).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, expected)
    expect(transferred).toBe(expected)
    expect(container.close).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/pull/3108#discussion_r4387200771
  // ROOT CAUSE:
  //
  // The first substring match selected cobblestone before stone.
  // Exact names now take priority over substring matches.
  it.each([
    { quantity: 'default', requested: undefined, expected: 80 },
    { quantity: 'all', requested: -1, expected: 80 },
    { quantity: 'limited', requested: 70, expected: 70 },
    { quantity: 'excess', requested: 128, expected: 80 },
  ])('prefers exact-name stacks for a $quantity quantity (PR #3108)', async ({ requested, expected }) => {
    const { mineflayer, container } = createFixture({
      inventory: [
        { name: 'cobblestone', count: 64 },
        { name: 'cobblestone', count: 32 },
        { name: 'stone', count: 64 },
        { name: 'stone', count: 16 },
      ],
    })

    const transferred = await putInChest(mineflayer, 'stone', requested)

    expect(container.deposit).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.stone.id, null, expected)
    expect(transferred).toBe(expected)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('uses the first substring match when no exact name exists', async () => {
    const { mineflayer, container } = createFixture({
      inventory: [
        { name: 'cobblestone', count: 64 },
        { name: 'mossy_cobblestone', count: 64 },
        { name: 'cobblestone', count: 32 },
      ],
    })

    const transferred = await putInChest(mineflayer, 'stone')

    expect(container.deposit).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, 96)
    expect(transferred).toBe(96)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('uses the inventory from the open window instead of the earlier player inventory', async () => {
    const { mineflayer, container } = createFixture({
      inventory: [{ name: 'cobblestone', count: 64 }],
      openedInventory: [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 32 }],
    })

    const transferred = await putInChest(mineflayer, 'cobblestone', 96)

    expect(container.deposit).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, 96)
    expect(transferred).toBe(96)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('closes the window once and preserves a rejected deposit', async () => {
    const { mineflayer, container } = createFixture({ inventory: [{ name: 'cobblestone', count: 64 }] })
    const error = new Error('The chest is full')
    container.deposit.mockRejectedValueOnce(error)

    await expect(putInChest(mineflayer, 'cobblestone', 32)).rejects.toBe(error)

    expect(container.close).toHaveBeenCalledOnce()
  })

  it('preserves the deposit error when closing the window also fails', async () => {
    const { mineflayer, container } = createFixture({ inventory: [{ name: 'cobblestone', count: 64 }] })
    const transferError = new Error('The chest is full')
    const closeError = new Error('The window did not close')
    container.deposit.mockRejectedValueOnce(transferError)
    container.close.mockImplementationOnce(() => {
      throw closeError
    })

    await expect(putInChest(mineflayer, 'cobblestone', 32)).rejects.toBe(transferError)

    expect(container.close).toHaveBeenCalledOnce()
  })

  it.each([
    { inventory: [] },
    { inventory: [{ name: 'dirt', count: 64 }] },
  ])('closes the open window when neither name match exists: %j', async ({ inventory }) => {
    const { mineflayer, container, openContainer } = createFixture({ inventory })

    await expect(putInChest(mineflayer, 'cobblestone')).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' })

    expect(openContainer).toHaveBeenCalledOnce()
    expect(container.deposit).not.toHaveBeenCalled()
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('preserves an open failure without closing an unopened window', async () => {
    const { mineflayer, container, openContainer } = createFixture({ inventory: [{ name: 'cobblestone', count: 64 }] })
    const error = new Error('The chest did not open')
    openContainer.mockRejectedValueOnce(error)

    await expect(putInChest(mineflayer, 'cobblestone')).rejects.toBe(error)

    expect(container.deposit).not.toHaveBeenCalled()
    expect(container.close).not.toHaveBeenCalled()
  })
})

describe('takeFromChest', () => {
  it.each([
    { requested: 96, expected: 96 },
    { requested: 80, expected: 80 },
    { requested: 128, expected: 96 },
  ])('takes $expected items across stacks for a request of $requested', async ({ requested, expected }) => {
    const { mineflayer, container } = createFixture({
      chest: [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 32 }],
    })

    const transferred = await takeFromChest(mineflayer, 'cobblestone', requested)

    expect(container.withdraw).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, expected)
    expect(transferred).toBe(expected)
    expect(container.close).toHaveBeenCalledOnce()
  })

  // https://github.com/moeru-ai/airi/pull/3108#discussion_r4387200771
  // ROOT CAUSE:
  //
  // The first substring match selected cobblestone before stone.
  // Exact names now take priority over substring matches.
  it.each([
    { quantity: 'default', requested: undefined, expected: 80 },
    { quantity: 'all', requested: -1, expected: 80 },
    { quantity: 'limited', requested: 70, expected: 70 },
    { quantity: 'excess', requested: 128, expected: 80 },
  ])('prefers exact-name stacks for a $quantity quantity (PR #3108)', async ({ requested, expected }) => {
    const { mineflayer, container } = createFixture({
      chest: [
        { name: 'cobblestone', count: 64 },
        { name: 'cobblestone', count: 32 },
        { name: 'stone', count: 64 },
        { name: 'stone', count: 16 },
      ],
    })

    const transferred = await takeFromChest(mineflayer, 'stone', requested)

    expect(container.withdraw).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.stone.id, null, expected)
    expect(transferred).toBe(expected)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('uses the first substring match when no exact name exists', async () => {
    const { mineflayer, container } = createFixture({
      chest: [
        { name: 'cobblestone', count: 64 },
        { name: 'mossy_cobblestone', count: 64 },
        { name: 'cobblestone', count: 32 },
      ],
    })

    const transferred = await takeFromChest(mineflayer, 'stone')

    expect(container.withdraw).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, 96)
    expect(transferred).toBe(96)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('closes the window once and preserves a rejected withdrawal', async () => {
    const { mineflayer, container } = createFixture({ chest: [{ name: 'cobblestone', count: 64 }] })
    const error = new Error('The inventory is full')
    container.withdraw.mockRejectedValueOnce(error)

    await expect(takeFromChest(mineflayer, 'cobblestone', 32)).rejects.toBe(error)

    expect(container.close).toHaveBeenCalledOnce()
  })

  it('rejects when the transfer succeeds but closing the window fails', async () => {
    const { mineflayer, container } = createFixture({ chest: [{ name: 'cobblestone', count: 64 }] })
    const error = new Error('The window did not close')
    container.close.mockImplementationOnce(() => {
      throw error
    })

    await expect(takeFromChest(mineflayer, 'cobblestone', 32)).rejects.toBe(error)

    expect(container.withdraw).toHaveBeenCalledExactlyOnceWith(registry.itemsByName.cobblestone.id, null, 32)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it.each([
    { chest: [] },
    { chest: [{ name: 'dirt', count: 64 }] },
  ])('closes the open window when neither name match exists: %j', async ({ chest }) => {
    const { mineflayer, container, openContainer } = createFixture({ chest })

    await expect(takeFromChest(mineflayer, 'cobblestone')).rejects.toMatchObject({ code: 'ITEM_NOT_FOUND' })

    expect(openContainer).toHaveBeenCalledOnce()
    expect(container.withdraw).not.toHaveBeenCalled()
    expect(container.close).toHaveBeenCalledOnce()
  })

  it('preserves an open failure without closing an unopened window', async () => {
    const { mineflayer, container, openContainer } = createFixture({ chest: [{ name: 'cobblestone', count: 64 }] })
    const error = new Error('The chest did not open')
    openContainer.mockRejectedValueOnce(error)

    await expect(takeFromChest(mineflayer, 'cobblestone')).rejects.toBe(error)

    expect(container.withdraw).not.toHaveBeenCalled()
    expect(container.close).not.toHaveBeenCalled()
  })
})

describe('chest action feedback', () => {
  it.each([
    { name: 'putInChest', feedback: 'Put [cobblestone]x96 in chest' },
    { name: 'takeFromChest', feedback: 'Took [cobblestone]x96 from chest' },
  ])('$name reports the completed quantity instead of the requested quantity', async ({ name, feedback }) => {
    const { mineflayer, container } = createFixture({
      inventory: [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 32 }],
      chest: [{ name: 'cobblestone', count: 64 }, { name: 'cobblestone', count: 32 }],
    })
    const action = actionsList.find(action => action.name === name)
    if (!action)
      throw new Error(`The ${name} action is missing`)

    const result = await action.perform(mineflayer)('cobblestone', 128)

    expect(result).toBe(feedback)
    expect(container.close).toHaveBeenCalledOnce()
  })

  it.each(['putInChest', 'takeFromChest'])('%s rejects instead of returning success feedback after a failed transfer', async (name) => {
    const { mineflayer, container } = createFixture({
      inventory: [{ name: 'cobblestone', count: 64 }],
      chest: [{ name: 'cobblestone', count: 64 }],
    })
    const error = new Error('The transfer failed')
    const transfer = name === 'putInChest' ? container.deposit : container.withdraw
    transfer.mockRejectedValueOnce(error)
    const action = actionsList.find(action => action.name === name)
    if (!action)
      throw new Error(`The ${name} action is missing`)

    await expect(action.perform(mineflayer)('cobblestone', 32)).rejects.toBe(error)

    expect(container.close).toHaveBeenCalledOnce()
  })
})
