import type { Agent } from 'neuri'
import type { Message } from 'neuri/openai'

import type { Mineflayer } from '../../libs/mineflayer'
import type { PlanStep } from '../planning/adapter'

import { agent } from 'neuri'
import { system, user } from 'neuri/openai'

import { BaseLLMHandler } from '../../libs/llm-agent/handler'
import { useLogger } from '../../utils/logger'
import { actionsList } from './tools'

export async function createActionNeuriAgent(mineflayer: Mineflayer): Promise<Agent> {
  const logger = useLogger()
  logger.log('Initializing action agent')
  let actionAgent = agent('action')

  Object.values(actionsList).forEach((action) => {
    actionAgent = actionAgent.tool(
      action.name,
      action.schema,
      async ({ parameters }) => {
        logger.withFields({ name: action.name, parameters }).log('Calling action')
        mineflayer.memory.actions.push(action)
        const fn = action.perform(mineflayer)
        return await fn(...Object.values(parameters))
      },
      { description: action.description },
    )
  })

  return actionAgent.build()
}

export class ActionLLMHandler extends BaseLLMHandler {
  public async executeStep(step: PlanStep): Promise<string> {
    const systemPrompt = this.generateActionSystemPrompt()
    const userPrompt = this.generateActionUserPrompt(step)
    const messages = [system(systemPrompt), user(userPrompt)]

    const result = await this.handleAction(messages)
    return result
  }

  private generateActionSystemPrompt(): string {
    return `You are a Minecraft bot action executor. Your task is to execute a given step using available tools.
You have access to various tools that can help you accomplish tasks.
When using a tool:
1. Choose the most appropriate tool for the task
2. Determine the correct parameters based on the context
3. Handle any errors or unexpected situations

Remember to:
- Be precise with tool parameters
- Consider the current state of the bot
- Handle failures gracefully`
  }

  private generateActionUserPrompt(step: PlanStep): string {
    return `Execute this step: ${step.description}

Suggested tool: ${step.tool}
Params: ${JSON.stringify(step.params)}

Please use the appropriate tool with the correct parameters to accomplish this step.
If the suggested tool is not appropriate, you may choose a different one.`
  }

  public async handleAction(messages: Message[]): Promise<string> {
    const result = await this.config.agent.handleStateless(messages, async (context) => {
      this.logger.log('Processing action...')
      const retryHandler = this.createRetryHandler(
        async ctx => (await this.handleCompletion(ctx, 'action', ctx.messages)).content,
      )
      return await retryHandler(context)
    })

    if (!result) {
      throw new Error('Failed to process action')
    }

    return result
  }
}
