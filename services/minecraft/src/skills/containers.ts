import type { Block } from 'prismarine-block'

import type { Mineflayer } from '../libs/mineflayer'

export async function withContainer<T>(
  mineflayer: Mineflayer,
  block: Block,
  callback: (container: Awaited<ReturnType<Mineflayer['bot']['openContainer']>>) => Promise<T>,
): Promise<T> {
  const container = await mineflayer.bot.openContainer(block)
  try {
    return await callback(container)
  }
  finally {
    await container.close()
  }
}

export async function withFurnace<T>(
  mineflayer: Mineflayer,
  block: Block,
  callback: (furnace: Awaited<ReturnType<Mineflayer['bot']['openFurnace']>>) => Promise<T>,
): Promise<T> {
  const furnace = await mineflayer.bot.openFurnace(block)
  try {
    return await callback(furnace)
  }
  finally {
    await mineflayer.bot.closeWindow(furnace)
  }
}
