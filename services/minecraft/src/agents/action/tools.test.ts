import { sleep } from '@moeru/std'
import { messages, system, user } from 'neuri/openai'
import { beforeAll, describe, expect, it } from 'vitest'

import { initBot, useBot } from '../../composables/bot'
import { config, initEnv } from '../../composables/config'
import { createNeuriAgent } from '../../composables/neuri'
import { initLogger } from '../../utils/logger'

describe.skip('actions agent', { timeout: 0 }, () => {
  beforeAll(() => {
    initLogger()
    initEnv()
    initBot({ botConfig: config.bot })
  })

  it('should choose right query command', async () => {
    const { bot } = useBot()
    const agent = await createNeuriAgent()

    await new Promise<void>((resolve) => {
      bot.bot.once('spawn', async () => {
        const text = await agent.handle(messages(
          system('You are an action selection agent.'),
          user('What\'s your status?'),
        ), async (c) => {
          const completion = await c.reroute('query', c.messages, { model: config.openai.model })
          return await completion?.firstContent()
        })

        expect(text?.toLowerCase()).toContain('position')

        resolve()
      })
    })
  })

  it('should choose right action command', async () => {
    const { bot } = useBot()
    const agent = await createNeuriAgent()

    await new Promise<void>((resolve) => {
      bot.bot.on('spawn', async () => {
        const text = await agent.handle(messages(
          system('You are an action selection agent.'),
          user('goToPlayer: luoling8192'),
        ), async (c) => {
          const completion = await c.reroute('action', c.messages, { model: config.openai.model })

          return await completion?.firstContent()
        })

        expect(text).toContain('goToPlayer')

        await sleep(10000)
        resolve()
      })
    })
  })
})
