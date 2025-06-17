import type { Message } from 'neuri/openai'

import type { Action } from './action'

export class Memory {
  public chatHistory: Message[]
  public actions: Action[]

  constructor() {
    this.chatHistory = []
    this.actions = []
  }
}
