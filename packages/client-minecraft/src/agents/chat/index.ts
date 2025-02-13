import type { ChatAgent } from '../../libs/mineflayer/base-agent'
import type { ChatAgentConfig, ChatContext } from './types'

import { AbstractAgent } from '../../libs/mineflayer/base-agent'
import { generateChatResponse } from './llm'

export class ChatAgentImpl extends AbstractAgent implements ChatAgent {
  public readonly type = 'chat' as const
  private activeChats: Map<string, ChatContext>
  private maxHistoryLength: number
  private idleTimeout: number
  private llmConfig: ChatAgentConfig['llm']

  constructor(config: ChatAgentConfig) {
    super(config)
    this.activeChats = new Map()
    this.maxHistoryLength = config.maxHistoryLength ?? 50
    this.idleTimeout = config.idleTimeout ?? 5 * 60 * 1000 // 5 minutes
    this.llmConfig = config.llm
  }

  protected async initializeAgent(): Promise<void> {
    this.logger.log('Initializing chat agent')

    this.on('message', async ({ sender, message }) => {
      await this.handleAgentMessage(sender, message)
    })

    setInterval(() => {
      this.checkIdleChats()
    }, 60 * 1000)
  }

  protected async destroyAgent(): Promise<void> {
    this.activeChats.clear()
    this.removeAllListeners()
  }

  public async processMessage(message: string, sender: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Chat agent not initialized')
    }

    this.logger.withFields({ sender, message }).log('Processing message')

    try {
      // Get or create chat context
      const context = this.getOrCreateContext(sender)

      // Add message to history
      this.addToHistory(context, sender, message)

      // Update last activity time
      context.lastUpdate = Date.now()

      // Generate response using LLM
      const response = await this.generateResponse(message, context)

      // Add response to history
      this.addToHistory(context, this.id, response)

      return response
    }
    catch (error) {
      this.logger.withError(error).error('Failed to process message')
      throw error
    }
  }

  public startConversation(player: string): void {
    if (!this.initialized) {
      throw new Error('Chat agent not initialized')
    }

    this.logger.withField('player', player).log('Starting conversation')

    const context = this.getOrCreateContext(player)
    context.startTime = Date.now()
    context.lastUpdate = Date.now()
  }

  public endConversation(player: string): void {
    if (!this.initialized) {
      throw new Error('Chat agent not initialized')
    }

    this.logger.withField('player', player).log('Ending conversation')

    if (this.activeChats.has(player)) {
      const context = this.activeChats.get(player)!
      // Archive chat history if needed
      this.archiveChat(context)
      this.activeChats.delete(player)
    }
  }

  private getOrCreateContext(player: string): ChatContext {
    let context = this.activeChats.get(player)
    if (!context) {
      context = {
        player,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        history: [],
      }
      this.activeChats.set(player, context)
    }
    return context
  }

  private addToHistory(context: ChatContext, sender: string, message: string): void {
    context.history.push({
      sender,
      message,
      timestamp: Date.now(),
    })

    // Trim history if too long
    if (context.history.length > this.maxHistoryLength) {
      context.history = context.history.slice(-this.maxHistoryLength)
    }
  }

  private async generateResponse(message: string, context: ChatContext): Promise<string> {
    return await generateChatResponse(message, context.history, {
      agent: this.llmConfig.agent,
      model: this.llmConfig.model,
      maxContextLength: this.maxHistoryLength,
    })
  }

  private checkIdleChats(): void {
    const now = Date.now()
    for (const [player, context] of this.activeChats.entries()) {
      if (now - context.lastUpdate > this.idleTimeout) {
        this.logger.withField('player', player).log('Ending idle conversation')
        this.endConversation(player)
      }
    }
  }

  private async archiveChat(context: ChatContext): Promise<void> {
    // Archive chat history to persistent storage if needed
    this.logger.withFields({
      player: context.player,
      messageCount: context.history.length,
      duration: Date.now() - context.startTime,
    }).log('Archiving chat history')
  }

  private async handleAgentMessage(sender: string, message: string): Promise<void> {
    if (sender === 'system') {
      if (message.includes('interrupt')) {
        // Handle system interrupt
        for (const player of this.activeChats.keys()) {
          this.endConversation(player)
        }
      }
    }
    else {
      // Handle messages from other agents
      const context = this.activeChats.get(sender)
      if (context) {
        await this.processMessage(message, sender)
      }
    }
  }
}
