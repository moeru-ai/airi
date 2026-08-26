import type { Message } from '@xsai/shared-chat'

import type { Action } from './action'

export class Memory {
  public actions: Action[]
  public chatHistory: Message[]

  constructor() {
    this.chatHistory = []
    this.actions = []
  }
}
