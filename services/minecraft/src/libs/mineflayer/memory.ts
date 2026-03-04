import type { Message } from '@xsai/shared-chat'

import type { Action } from './action'

export class Memory {
  public chatHistory: Message[]
  public actions: Action[]

  constructor() {
    this.chatHistory = []
    this.actions = []
  }
}
