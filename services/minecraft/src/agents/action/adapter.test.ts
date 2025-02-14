import { messages, system, user } from 'neuri/openai'
import { beforeAll, describe, expect, it } from 'vitest'

import { initBot, useBot } from '../../composables/bot'
import { config, initEnv } from '../../composables/config'
import { createNeuriAgent } from '../../composables/neuri'
import { generateSystemBasicPrompt } from '../../libs/llm-agent/prompt'
import { initLogger } from '../../utils/logger'

describe('openAI agent', { timeout: 0 }, () => {
  beforeAll(() => {
    initLogger()
    initEnv()
    initBot({ botConfig: config.bot })
  })

  it('should initialize the agent', async () => {
    const { bot } = useBot()
    const agent = await createNeuriAgent(bot)

    await new Promise<void>((resolve) => {
      bot.bot.once('spawn', async () => {
        const text = await agent.handle(
          messages(
            system(generateSystemBasicPrompt('airi')),
            user('Hello, who are you?'),
          ),
          async (c) => {
            const completion = await c.reroute('query', c.messages, { model: config.openai.model })
            return await completion?.firstContent()
          },
        )

        expect(text?.toLowerCase()).toContain('airi')

        resolve()
      })
    })
  })
})
