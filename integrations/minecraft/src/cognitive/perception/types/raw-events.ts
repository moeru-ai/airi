export type DamageSourceCause
  = | 'anvil'
    | 'drown'
    | 'explosion'
    | 'fall'
    | 'fire'
    | 'gravity'
    | 'lava'
    | 'mob'
    | 'player'
    | 'projectile'
    | 'unknown'

export interface DamageSourceMetadata {
  cause: DamageSourceCause
  distance?: number
  entityId?: string
  name?: string
}
