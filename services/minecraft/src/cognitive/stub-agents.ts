import type { ActionAgent, ChatAgent } from '../libs/mineflayer/base-agent'

export class StubActionAgent implements ActionAgent {
  readonly id = 'stub-action'
  readonly type = 'action' as const

  async init(): Promise<void> {
    // No-op
  }

  async destroy(): Promise<void> {
    // No-op
  }

  async performAction(_step: any): Promise<string> {
    throw new Error('ActionAgent not available - legacy agents have been deprecated')
  }

  getAvailableActions(): any[] {
    return []
  }
}

export class StubChatAgent implements ChatAgent {
  readonly id = 'stub-chat'
  readonly type = 'chat' as const

  async init(): Promise<void> {
    // No-op
  }

  async destroy(): Promise<void> {
    // No-op
  }

  async processMessage(_message: string, _sender: string): Promise<string> {
    throw new Error('ChatAgent not available - legacy agents have been deprecated')
  }

  async sendMessage(_message: string): Promise<void> {
    throw new Error('ChatAgent not available - legacy agents have been deprecated')
  }

  startConversation(_player: string): void {
    // No-op
  }

  endConversation(_player: string): void {
    // No-op
  }
}
