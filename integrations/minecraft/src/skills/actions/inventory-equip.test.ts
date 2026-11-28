import type { Bot } from 'mineflayer'

import type { Mineflayer } from '../../libs/mineflayer/core'

import minecraftData from 'minecraft-data'
import prismarineItem from 'prismarine-item'
import prismarineWindows from 'prismarine-windows'

import { describe, expect, it, vi } from 'vitest'

import { actionsList } from '../../cognitive/action/llm-actions'

const version = '1.21.4'
const registry = minecraftData(version)
const Item = prismarineItem(version)
const windows = prismarineWindows(version)

function createInventory(item?: InstanceType<typeof Item>) {
  const inventory = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
  if (!inventory)
    throw new Error('The fixture requires an inventory window')
  if (item)
    inventory.updateSlot(inventory.inventoryStart, item)
  return inventory
}

describe('equip action', () => {
  it.each([
    { name: 'shield', destination: 'off-hand' },
    { name: 'elytra', destination: 'torso' },
    { name: 'diamond_helmet', destination: 'head' },
    { name: 'diamond_chestplate', destination: 'torso' },
    { name: 'diamond_leggings', destination: 'legs' },
    { name: 'diamond_boots', destination: 'feet' },
    { name: 'diamond_sword', destination: 'hand' },
  ] as const)('equips $name in $destination through the tool', async ({ name, destination }) => {
    const action = actionsList.find(action => action.name === 'equip')
    if (!action)
      throw new Error('The equip action is missing')

    const item = new Item(registry.itemsByName[name].id, 1)
    const equip = vi.fn<Bot['equip']>().mockResolvedValue(undefined)
    const inventory = createInventory(item)
    const bot: Pick<Bot, 'inventory' | 'equip'> = { inventory, equip }
    const mineflayer = { bot: bot as Bot } as Mineflayer

    expect(item.name).toBe(name)

    const result = await action.perform(mineflayer)(name)

    expect(equip).toHaveBeenCalledExactlyOnceWith(item, destination)
    expect(result).toBe(`Equipped [${name}]`)
  })

  it('rejects a missing item without an equipment change', async () => {
    const action = actionsList.find(action => action.name === 'equip')
    if (!action)
      throw new Error('The equip action is missing')

    const equip = vi.fn<Bot['equip']>()
    const inventory = createInventory()
    const bot: Pick<Bot, 'inventory' | 'equip'> = { inventory, equip }

    await expect(action.perform({ bot: bot as Bot } as Mineflayer)('shield')).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
    })
    expect(equip).not.toHaveBeenCalled()
  })

  it('preserves equipment failures instead of reporting success', async () => {
    const action = actionsList.find(action => action.name === 'equip')
    if (!action)
      throw new Error('The equip action is missing')

    const item = new Item(registry.itemsByName.shield.id, 1)
    const error = new Error('Equipment transfer failed')
    const equip = vi.fn<Bot['equip']>().mockRejectedValue(error)
    const inventory = createInventory(item)
    const bot: Pick<Bot, 'inventory' | 'equip'> = { inventory, equip }

    await expect(action.perform({ bot: bot as Bot } as Mineflayer)('shield')).rejects.toBe(error)
  })
})
