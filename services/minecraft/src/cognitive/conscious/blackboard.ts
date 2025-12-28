import type { Vec3 } from 'vec3'

export interface SelfState {
  status: 'idle' | 'moving' | 'working' | 'chatting' | 'busy'
  location: Vec3 | null
  holding: string | null
  health: number
  food: number
  oxygen: number
}

export interface EnvironmentState {
  time: string // 'day' | 'night' | 'sunset' | 'sunrise'
  weather: 'clear' | 'rain' | 'thunder'
  nearbyPlayers: string[]
  nearbyEntities: string[] // significant entities (mobs, dropped items of interest)
  lightLevel: number
}

export interface BlackboardState {
  currentGoal: string
  currentThought: string
  executionStrategy: string
  self: SelfState
  environment: EnvironmentState
}

export class Blackboard {
  private _state: BlackboardState

  constructor() {
    this._state = {
      currentGoal: 'Idle',
      currentThought: 'I am waiting for something to happen.',
      executionStrategy: 'Observe surroundings.',
      self: {
        status: 'idle',
        location: null,
        holding: null,
        health: 20,
        food: 20,
        oxygen: 20,
      },
      environment: {
        time: 'day',
        weather: 'clear',
        nearbyPlayers: [],
        nearbyEntities: [],
        lightLevel: 15,
      },
    }
  }

  // Getters
  public get goal(): string { return this._state.currentGoal }
  public get thought(): string { return this._state.currentThought }
  public get strategy(): string { return this._state.executionStrategy }
  public get self(): SelfState { return this._state.self }
  public get environment(): EnvironmentState { return this._state.environment }

  // Setters (Partial updates allowed)
  public update(updates: Partial<BlackboardState>): void {
    this._state = { ...this._state, ...updates }
  }

  public updateSelf(updates: Partial<SelfState>): void {
    this._state.self = { ...this._state.self, ...updates }
  }

  public updateEnvironment(updates: Partial<EnvironmentState>): void {
    this._state.environment = { ...this._state.environment, ...updates }
  }

  public getSnapshot(): BlackboardState {
    // Return a deep copy or safe reference?
    // For now, return a shallow copy of the state structure
    return {
      ...this._state,
      self: { ...this._state.self }, // location (Vec3) is an object, but usually treated efficiently.
      environment: { ...this._state.environment, nearbyPlayers: [...this._state.environment.nearbyPlayers], nearbyEntities: [...this._state.environment.nearbyEntities] },
    }
  }
}
