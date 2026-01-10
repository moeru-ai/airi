export interface ContextViewState {
  selfSummary: string
  environmentSummary: string
}

export interface BlackboardState {
  currentGoal: string
  currentThought: string
  executionStrategy: string
  contextView: ContextViewState
}

export class Blackboard {
  private _state: BlackboardState

  constructor() {
    this._state = {
      currentGoal: 'Idle',
      currentThought: 'I am waiting for something to happen.',
      executionStrategy: 'Observe surroundings.',
      contextView: {
        selfSummary: 'Unknown',
        environmentSummary: 'Unknown',
      },
    }
  }

  // Getters
  public get goal(): string { return this._state.currentGoal }
  public get thought(): string { return this._state.currentThought }
  public get strategy(): string { return this._state.executionStrategy }
  public get selfSummary(): string { return this._state.contextView.selfSummary }
  public get environmentSummary(): string { return this._state.contextView.environmentSummary }

  // Setters (Partial updates allowed)
  public update(updates: Partial<BlackboardState>): void {
    this._state = { ...this._state, ...updates }
  }

  public updateContextView(updates: Partial<ContextViewState>): void {
    this._state.contextView = { ...this._state.contextView, ...updates }
  }

  public getSnapshot(): BlackboardState {
    return {
      ...this._state,
      contextView: { ...this._state.contextView },
    }
  }
}
