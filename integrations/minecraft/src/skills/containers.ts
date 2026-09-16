import type { Block } from 'prismarine-block'

import type { Mineflayer } from '../libs/mineflayer'

async function withCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => void | Promise<void>,
): Promise<T> {
  let result!: T
  let runError: unknown

  try {
    result = await run()
  }
  catch (error) {
    runError = error
  }

  let cleanupError: unknown
  try {
    await cleanup()
  }
  catch (error) {
    cleanupError = error
  }

  if (runError)
    throw runError
  if (cleanupError)
    throw cleanupError

  return result
}

export async function withContainer<T>(
  mineflayer: Mineflayer,
  block: Block,
  callback: (container: Awaited<ReturnType<Mineflayer['bot']['openContainer']>>) => Promise<T>,
): Promise<T> {
  const container = await mineflayer.bot.openContainer(block)

  return withCleanup(
    () => callback(container),
    () => container.close(),
  )
}

export async function withFurnace<T>(
  mineflayer: Mineflayer,
  block: Block,
  callback: (furnace: Awaited<ReturnType<Mineflayer['bot']['openFurnace']>>) => Promise<T>,
): Promise<T> {
  const furnace = await mineflayer.bot.openFurnace(block)

  return withCleanup(
    () => callback(furnace),
    async () => {
      if (typeof mineflayer.bot.closeWindow === 'function') {
        await mineflayer.bot.closeWindow(furnace)
      }
      else {
        furnace.close()
      }
    },
  )
}
