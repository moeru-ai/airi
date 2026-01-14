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
  recentActionHistory: string[]
  pendingActions: string[]
  selfUsername: string
}

export class Blackboard {
  private _state: BlackboardState
  private static readonly MAX_CHAT_HISTORY = 8
  private static readonly MAX_ACTION_HISTORY = 12
  private static readonly MAX_PENDING_ACTIONS = 12

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
      recentActionHistory: [],
      pendingActions: [],
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
  public get recentActionHistory(): string[] { return this._state.recentActionHistory }
  public get pendingActions(): string[] { return this._state.pendingActions }
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

  public addActionHistoryLine(line: string): void {
    const next = [...this._state.recentActionHistory, line]
    const trimmed = next.length > Blackboard.MAX_ACTION_HISTORY ? next.slice(-Blackboard.MAX_ACTION_HISTORY) : next
    this._state = { ...this._state, recentActionHistory: trimmed }
  }

  public setPendingActions(lines: string[]): void {
    const trimmed = lines.length > Blackboard.MAX_PENDING_ACTIONS ? lines.slice(0, Blackboard.MAX_PENDING_ACTIONS) : lines
    this._state = { ...this._state, pendingActions: trimmed }
  }

  public getSnapshot(): BlackboardState {
    return {
      ...this._state,
      contextView: { ...this._state.contextView },
      chatHistory: [...this._state.chatHistory],
      recentActionHistory: [...this._state.recentActionHistory],
      pendingActions: [...this._state.pendingActions],
    }
  }
}
