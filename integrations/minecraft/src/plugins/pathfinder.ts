import type { Context } from '../libs/mineflayer'
import type { MineflayerPlugin } from '../libs/mineflayer/plugin'

import pathfinderModel from 'mineflayer-pathfinder'

import { useLogger } from '../utils/logger'

const { goals, Movements } = pathfinderModel

export function PathFinder(options?: { rangeGoal: number }): MineflayerPlugin {
  return {
    created(bot) {
      const logger = useLogger()

      let defaultMove: any

      const handleCome = (commandCtx: Context) => {
        const username = commandCtx.command!.sender
        if (!username) {
          throw new Error('no player name specified')
        }

        logger.withFields({ username }).log('Come command received')
        const target = bot.bot.players[username]?.entity
        if (!target) {
          throw new Error(`can't find player ${username}, maybe they're too far away?`)
        }

        const { x: playerX, y: playerY, z: playerZ } = target.position

        bot.bot.pathfinder.setMovements(defaultMove)
        bot.bot.pathfinder.setGoal(new goals.GoalNear(playerX, playerY, playerZ, options?.rangeGoal ?? 1))
      }

      defaultMove = new Movements(bot.bot)
      bot.onCommand('come', handleCome)
    },
  }
}
