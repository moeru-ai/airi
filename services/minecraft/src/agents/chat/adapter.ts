import type { ChatHistory } from './types'

import { system, user } from 'neuri/openai'

import { BaseLLMHandler } from '../../libs/llm-agent/handler'

export function generateChatAgentPrompt(): string {
  return `You are a Minecraft bot assistant. Your task is to engage in natural conversation with players while helping them achieve their goals.

Guidelines:
1. Be friendly and helpful
2. Keep responses concise but informative
3. Use game-appropriate language
4. Acknowledge player's emotions and intentions
5. Ask for clarification when needed
6. Remember context from previous messages
7. Be proactive in suggesting helpful actions

You can:
- Answer questions about the game
- Help with tasks and crafting
- Give directions and suggestions
- Engage in casual conversation
- Coordinate with other bots

Remember that you're operating in a Minecraft world and should maintain that context in your responses.`
}

export class ChatLLMHandler extends BaseLLMHandler {
  public async generateResponse(
    message: string,
    history: ChatHistory[],
  ): Promise<string> {
    const systemPrompt = generateChatAgentPrompt()
    const chatHistory = this.formatChatHistory(history, this.config.maxContextLength ?? 10)
    const messages = [
      system(systemPrompt),
      ...chatHistory,
      user(message),
    ]

    const result = await this.config.agent.handleStateless(messages, async (context) => {
      this.logger.log('Generating response...')
      const retryHandler = this.createRetryHandler(
        async ctx => (await this.handleCompletion(ctx, 'chat', ctx.messages)).content,
      )
      return await retryHandler(context)
    })

    if (!result) {
      throw new Error('Failed to generate response')
    }

    return result
  }

  private formatChatHistory(
    history: ChatHistory[],
    maxLength: number,
  ): Array<{ role: 'user' | 'assistant', content: string }> {
    const recentHistory = history.slice(-maxLength)
    return recentHistory.map(entry => ({
      role: entry.sender === 'bot' ? 'assistant' : 'user',
      content: entry.message,
    }))
  }
}
