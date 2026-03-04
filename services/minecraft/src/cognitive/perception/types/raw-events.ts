export type DamageSourceCause
  = | 'player'
    | 'mob'
    | 'fall'
    | 'lava'
    | 'fire'
    | 'drown'
    | 'anvil'
    | 'gravity'
    | 'explosion'
    | 'projectile'
    | 'unknown'

export interface DamageSourceMetadata {
  cause: DamageSourceCause
  name?: string
  entityId?: string
  distance?: number
}
