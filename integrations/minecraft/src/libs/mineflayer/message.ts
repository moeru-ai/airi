import type { Entity } from 'prismarine-entity'

// Represents the context of a chat message in the Minecraft world
interface ChatMessage {
  readonly sender: {
    username: string
    entity: Entity | null
  }
  readonly content: string
}

// Handles chat message validation and processing
export class ChatMessageHandler {
  constructor(private readonly botUsername: string) {}

  // Creates a new chat message context with validation
  createMessageContext(entity: Entity | null, username: string, content: string): ChatMessage {
    return {
      sender: {
        username,
        entity,
      },
      content,
    }
  }

  // Checks if a message is from the bot itself
  isBotMessage(username: string): boolean {
    return username === this.botUsername
  }

  // Checks if a message is a command
  isCommand(content: string): boolean {
    return content.startsWith('#')
  }

  // Processes chat messages, filtering out bot's own messages
  handleChat(callback: (username: string, message: string) => void): (username: string, message: string) => void {
    return (username: string, message: string) => {
      if (!this.isBotMessage(username)) {
        callback(username, message)
      }
    }
  }
}
