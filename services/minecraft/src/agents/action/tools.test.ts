import { sleep } from '@moeru/std'
import { messages, system, user } from 'neuri/openai'
import { beforeAll, describe, expect, it } from 'vitest'

import { initBot, useBot } from '../../composables/bot'
import { config, initEnv } from '../../composables/config'
import { createNeuriAgent } from '../../composables/neuri'
import { generateActionAgentPrompt } from '../../libs/llm-agent/prompt'
import { initLogger } from '../../utils/logger'

describe('actions agent', { timeout: 0 }, () => {
  beforeAll(() => {
    initLogger()
    initEnv()
    initBot({ botConfig: config.bot })
  })

  it('should choose right query command', async () => {
    const { bot } = useBot()
    const agent = await createNeuriAgent(bot)

    await new Promise<void>((resolve) => {
      bot.bot.once('spawn', async () => {
        const text = await agent.handle(messages(
          system(generateActionAgentPrompt(bot)),
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
    const agent = await createNeuriAgent(bot)

    await new Promise<void>((resolve) => {
      bot.bot.on('spawn', async () => {
        const text = await agent.handle(messages(
          system(generateActionAgentPrompt(bot)),
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
