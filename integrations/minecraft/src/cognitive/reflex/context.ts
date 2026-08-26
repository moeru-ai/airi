import type { Vec3 } from 'vec3'

import { signal } from 'alien-signals'

export interface ReflexAttentionState {
  lastSignalAt: null | number
  lastSignalSourceId: null | string
  lastSignalType: null | string
}

export interface ReflexAutonomyState {
  followActive: boolean
  followDistance: number
  followLastError: null | string
  followPlayer: null | string
  /**
   * True while a survival reflex is actively driving the bot's body — fighting a mob (defend) or
   * escaping a hazard (escape-hazard). Suppresses auto-follow so its GoalFollow does not fight the
   * reflex's movement (the conflict that caused the mining stutter), and suppresses auto-eat. Set by
   * those behaviors; honoured in {@link ReflexRuntime}'s follow reconciliation.
   */
  reflexEngaged: boolean
}

export interface ReflexContextState {
  attention: ReflexAttentionState
  autonomy: ReflexAutonomyState
  environment: ReflexEnvironmentState
  now: number
  self: ReflexSelfState
  social: ReflexSocialState
  threat: ReflexThreatState
}

export interface ReflexEnvironmentState {
  lightLevel: number
  nearbyEntities: Array<{ distance?: number, kind?: string, name: string }>
  nearbyPlayers: Array<{ distance?: number, holding?: null | string, name: string }>
  time: string
  weather: 'clear' | 'rain' | 'thunder'
}

export interface ReflexSelfState {
  food: number
  health: number
  holding: null | string
  location: Vec3
}

export interface ReflexSocialState {
  lastGesture: null | string
  lastGestureAt: null | number
  lastMessage: null | string
  lastMessageAt: null | number
  lastSpeaker: null | string
}

export interface ReflexThreatState {
  lastThreatAt: null | number
  lastThreatSource: null | string
  threatScore: number
}

export class ReflexContext {
  private readonly attentionState = signal<ReflexAttentionState>({
    lastSignalAt: null,
    lastSignalSourceId: null,
    lastSignalType: null,
  })

  private readonly autonomyState = signal<ReflexAutonomyState>({
    followActive: false,
    followDistance: 2,
    followLastError: null,
    followPlayer: null,
    reflexEngaged: false,
  })

  private readonly environmentState = signal<ReflexEnvironmentState>({
    lightLevel: 15,
    nearbyEntities: [],
    nearbyPlayers: [],
    time: 'SOMETHING WENT WRONG, YOU SHOULD NOTIFY THE USER OF THIS',
    weather: 'clear',
  })

  private readonly nowState = signal<number>(Date.now())

  private readonly selfState = signal<ReflexSelfState>({
    food: 20,
    health: 20,
    holding: null,
    location: { x: 0, y: 0, z: 0 } as Vec3,
  })

  private readonly socialState = signal<ReflexSocialState>({
    lastGesture: null,
    lastGestureAt: null,
    lastMessage: null,
    lastMessageAt: null,
    lastSpeaker: null,
  })

  private readonly threatState = signal<ReflexThreatState>({
    lastThreatAt: null,
    lastThreatSource: null,
    threatScore: 0,
  })

  public autonomy(): ReflexAutonomyState {
    return { ...this.autonomyState() }
  }

  public getSnapshot(): ReflexContextState {
    const self = this.selfState()
    const environment = this.environmentState()
    const social = this.socialState()
    const threat = this.threatState()
    const attention = this.attentionState()
    const autonomy = this.autonomyState()

    return {
      attention: { ...attention },
      autonomy: { ...autonomy },
      environment: {
        ...environment,
        nearbyEntities: environment.nearbyEntities.map(e => ({ ...e })),
        nearbyPlayers: environment.nearbyPlayers.map(p => ({ ...p })),
      },
      now: this.nowState(),
      self: { ...self },
      social: { ...social },
      threat: { ...threat },
    }
  }

  public updateAttention(patch: Partial<ReflexAttentionState>): void {
    this.attentionState({ ...this.attentionState(), ...patch })
  }

  public updateAutonomy(patch: Partial<ReflexAutonomyState>): void {
    this.autonomyState({ ...this.autonomyState(), ...patch })
  }

  public updateEnvironment(patch: Partial<ReflexEnvironmentState>): void {
    this.environmentState({ ...this.environmentState(), ...patch })
  }

  public updateNow(now: number): void {
    this.nowState(now)
  }

  public updateSelf(patch: Partial<ReflexSelfState>): void {
    this.selfState({ ...this.selfState(), ...patch })
  }

  public updateSocial(patch: Partial<ReflexSocialState>): void {
    this.socialState({ ...this.socialState(), ...patch })
  }

  public updateThreat(patch: Partial<ReflexThreatState>): void {
    this.threatState({ ...this.threatState(), ...patch })
  }
}
