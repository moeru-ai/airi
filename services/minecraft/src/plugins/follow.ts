import type { MineflayerPlugin } from '../libs/mineflayer/plugin'

import pathfinderModel from 'mineflayer-pathfinder'

import { useLogger } from '../utils/logger'

export function FollowCommand(options?: { rangeGoal: number }): MineflayerPlugin {
  const logger = useLogger()
  const { goals, Movements } = pathfinderModel

  return {
    created(bot) {
      const state = {
        following: undefined as string | undefined,
        movements: new Movements(bot.bot),
      }

      function startFollow(username: string): void {
        state.following = username
        logger.withFields({ username }).log('Starting to follow player')
        followPlayer()
      }

      function stopFollow(): void {
        state.following = undefined
        logger.log('Stopping follow')
        bot.bot.pathfinder.stop()
      }

      function followPlayer(): void {
        if (!state.following)
          return

        const target = bot.bot.players[state.following]?.entity
        if (!target) {
          bot.bot.chat('I lost sight of you!')
          state.following = undefined
          return
        }

        const { x: playerX, y: playerY, z: playerZ } = target.position

        bot.bot.pathfinder.setMovements(state.movements)
        bot.bot.pathfinder.setGoal(new goals.GoalNear(playerX, playerY, playerZ, options?.rangeGoal ?? 1))
      }

      bot.onCommand('follow', (ctx) => {
        const username = ctx.command!.sender
        if (!username) {
          bot.bot.chat('Please specify a player name!')
          return
        }

        startFollow(username)
      })

      bot.onCommand('stop', () => {
        stopFollow()
      })

      bot.onTick('tick', () => {
        if (state.following)
          followPlayer()
      })
    },
  }
}
