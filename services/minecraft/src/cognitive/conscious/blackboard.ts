export interface contextViewState {
  selfSummary: string
  environmentSummary: string
}

export interface ChatMessage {
  sender: string
  content: string
  timestamp: number
}

export interface BlackboardState {
  ultimateGoal: string
  currentTask: string
  strategy: string
  contextView: contextViewState
  chatHistory: ChatMessage[]
  selfUsername: string
}

export class Blackboard {
  private _state: BlackboardState
  private static readonly MAX_CHAT_HISTORY = 8

  constructor() {
    this._state = {
      ultimateGoal: 'nothing',
      currentTask: 'I am waiting for something to happen.',
      strategy: 'idle',
      contextView: {
        selfSummary: 'Unknown',
        environmentSummary: 'Unknown',
      },
      chatHistory: [],
      selfUsername: 'Bot',
    }
  }

  // Getters
  public get ultimate_goal(): string { return this._state.ultimateGoal }
  public get current_task(): string { return this._state.currentTask }
  public get strategy(): string { return this._state.strategy }
  public get selfSummary(): string { return this._state.contextView.selfSummary }
  public get environmentSummary(): string { return this._state.contextView.environmentSummary }
  public get chatHistory(): ChatMessage[] { return this._state.chatHistory }
  public get selfUsername(): string { return this._state.selfUsername }

  // Setters (Partial updates allowed)
  public update(updates: Partial<BlackboardState>): void {
    this._state = { ...this._state, ...updates }
  }

  public updateContextView(updates: Partial<contextViewState>): void {
    this._state.contextView = { ...this._state.contextView, ...updates }
  }

  public addChatMessage(message: ChatMessage): void {
    const newHistory = [...this._state.chatHistory, message]
    if (newHistory.length > Blackboard.MAX_CHAT_HISTORY) {
      newHistory.shift() // Remove oldest
    }
    this._state = { ...this._state, chatHistory: newHistory }
  }

  public getSnapshot(): BlackboardState {
    return {
      ...this._state,
      contextView: { ...this._state.contextView },
      chatHistory: [...this._state.chatHistory],
    }
  }
}
