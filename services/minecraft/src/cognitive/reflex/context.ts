import type { Vec3 } from 'vec3'

import { signal } from 'alien-signals'

export interface ReflexSelfState {
  location: Vec3
  holding: string | null
  health: number
  food: number
}

export interface ReflexEnvironmentState {
  time: string
  weather: 'clear' | 'rain' | 'thunder'
  nearbyPlayers: Array<{ name: string, distance?: number, holding?: string | null }>
  nearbyEntities: Array<{ name: string, distance?: number, kind?: string }>
  lightLevel: number
}

export interface ReflexSocialState {
  lastSpeaker: string | null
  lastMessage: string | null
  lastMessageAt: number | null
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

export interface ReflexAutonomyState {
  followPlayer: string | null
  followDistance: number
  followActive: boolean
  followLastError: string | null
}

export interface ReflexContextState {
  now: number
  self: ReflexSelfState
  environment: ReflexEnvironmentState
  social: ReflexSocialState
  threat: ReflexThreatState
  attention: ReflexAttentionState
  autonomy: ReflexAutonomyState
}

export class ReflexContext {
  private readonly nowState = signal<number>(Date.now())
  private readonly selfState = signal<ReflexSelfState>({
    location: { x: 0, y: 0, z: 0 } as Vec3,
    holding: null,
    health: 20,
    food: 20,
  })

  private readonly environmentState = signal<ReflexEnvironmentState>({
    time: 'SOMETHING WENT WRONG, YOU SHOULD NOTIFY THE USER OF THIS',
    weather: 'clear',
    nearbyPlayers: [],
    nearbyEntities: [],
    lightLevel: 15,
  })

  private readonly socialState = signal<ReflexSocialState>({
    lastSpeaker: null,
    lastMessage: null,
    lastMessageAt: null,
    lastGesture: null,
    lastGestureAt: null,
  })

  private readonly threatState = signal<ReflexThreatState>({
    threatScore: 0,
    lastThreatAt: null,
    lastThreatSource: null,
  })

  private readonly attentionState = signal<ReflexAttentionState>({
    lastSignalType: null,
    lastSignalSourceId: null,
    lastSignalAt: null,
  })

  private readonly autonomyState = signal<ReflexAutonomyState>({
    followPlayer: null,
    followDistance: 2,
    followActive: false,
    followLastError: null,
  })

  public getSnapshot(): ReflexContextState {
    const self = this.selfState()
    const environment = this.environmentState()
    const social = this.socialState()
    const threat = this.threatState()
    const attention = this.attentionState()
    const autonomy = this.autonomyState()

    return {
      now: this.nowState(),
      self: { ...self },
      environment: {
        ...environment,
        nearbyPlayers: environment.nearbyPlayers.map(p => ({ ...p })),
        nearbyEntities: environment.nearbyEntities.map(e => ({ ...e })),
      },
      social: { ...social },
      threat: { ...threat },
      attention: { ...attention },
      autonomy: { ...autonomy },
    }
  }

  public autonomy(): ReflexAutonomyState {
    return { ...this.autonomyState() }
  }

  public updateNow(now: number): void {
    this.nowState(now)
  }

  public updateSelf(patch: Partial<ReflexSelfState>): void {
    this.selfState({ ...this.selfState(), ...patch })
  }

  public updateEnvironment(patch: Partial<ReflexEnvironmentState>): void {
    this.environmentState({ ...this.environmentState(), ...patch })
  }

  public updateSocial(patch: Partial<ReflexSocialState>): void {
    this.socialState({ ...this.socialState(), ...patch })
  }

  public updateThreat(patch: Partial<ReflexThreatState>): void {
    this.threatState({ ...this.threatState(), ...patch })
  }

  public updateAttention(patch: Partial<ReflexAttentionState>): void {
    this.attentionState({ ...this.attentionState(), ...patch })
  }

  public updateAutonomy(patch: Partial<ReflexAutonomyState>): void {
    this.autonomyState({ ...this.autonomyState(), ...patch })
  }
}
