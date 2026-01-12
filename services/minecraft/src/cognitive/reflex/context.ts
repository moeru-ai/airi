import type { Vec3 } from 'vec3'

export interface ReflexSelfState {
  location: Vec3 | null
  holding: string | null
  health: number
  food: number
  oxygen: number
}

export interface ReflexEnvironmentState {
  time: 'day' | 'night' | 'sunset' | 'sunrise'
  weather: 'clear' | 'rain' | 'thunder'
  nearbyPlayers: Array<{ name: string, distance?: number }>
  nearbyEntities: Array<{ name: string, distance?: number, kind?: string }>
  lightLevel: number
}

export interface ReflexSocialState {
  lastSpeaker: string | null
  lastMessage: string | null
  lastMessageAt: number | null
  lastGreetingAtBySpeaker: Record<string, number>
  lastGesture: string | null
  lastGestureAt: number | null
}

export interface ReflexThreatState {
  threatScore: number
  lastThreatAt: number | null
  lastThreatSource: string | null
}

export interface ReflexAttentionState {
  lastSignalType: string | null
  lastSignalSourceId: string | null
  lastSignalAt: number | null
}

export interface ReflexContextState {
  now: number
  self: ReflexSelfState
  environment: ReflexEnvironmentState
  social: ReflexSocialState
  threat: ReflexThreatState
  attention: ReflexAttentionState
}

export class ReflexContext {
  private state: ReflexContextState

  constructor() {
    this.state = {
      now: Date.now(),
      self: {
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
      social: {
        lastSpeaker: null,
        lastMessage: null,
        lastMessageAt: null,
        lastGreetingAtBySpeaker: {},
        lastGesture: null,
        lastGestureAt: null,
      },
      threat: {
        threatScore: 0,
        lastThreatAt: null,
        lastThreatSource: null,
      },
      attention: {
        lastSignalType: null,
        lastSignalSourceId: null,
        lastSignalAt: null,
      },
    }
  }

  public getSnapshot(): ReflexContextState {
    return {
      ...this.state,
      self: { ...this.state.self },
      environment: {
        ...this.state.environment,
        nearbyPlayers: this.state.environment.nearbyPlayers.map(p => ({ ...p })),
        nearbyEntities: this.state.environment.nearbyEntities.map(e => ({ ...e })),
      },
      social: {
        ...this.state.social,
        lastGreetingAtBySpeaker: { ...this.state.social.lastGreetingAtBySpeaker },
      },
      threat: { ...this.state.threat },
      attention: { ...this.state.attention },
    }
  }

  public updateNow(now: number): void {
    this.state.now = now
  }

  public updateSelf(patch: Partial<ReflexSelfState>): void {
    this.state.self = { ...this.state.self, ...patch }
  }

  public updateEnvironment(patch: Partial<ReflexEnvironmentState>): void {
    this.state.environment = { ...this.state.environment, ...patch }
  }

  public updateSocial(patch: Partial<ReflexSocialState>): void {
    this.state.social = { ...this.state.social, ...patch }
  }

  public updateThreat(patch: Partial<ReflexThreatState>): void {
    this.state.threat = { ...this.state.threat, ...patch }
  }

  public updateAttention(patch: Partial<ReflexAttentionState>): void {
    this.state.attention = { ...this.state.attention, ...patch }
  }
}
