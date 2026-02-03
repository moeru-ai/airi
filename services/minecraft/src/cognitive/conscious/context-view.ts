import type { ReflexContextState } from '../reflex/context'

export interface ConsciousContextView {
  selfSummary: string
  environmentSummary: string
}

export function buildConsciousContextView(ctx: ReflexContextState): ConsciousContextView {
  const pos = ctx.self.location
  const roundedPos = `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`
  const followState = ctx.autonomy.followPlayer
    ? ` Auto-follow target ${ctx.autonomy.followPlayer} (${ctx.autonomy.followActive ? 'active' : 'paused'})`
    : ' Auto-follow disabled'
  const selfSummary = `Position ${roundedPos} Health ${ctx.self.health}/20 Food ${ctx.self.food}/20 and I'm holding ${ctx.self.holding ?? 'nothing'}.${followState}`

  const players = ctx.environment.nearbyPlayers
    .map(p => (p.holding ? `${p.name} is holding (${p.holding})` : p.name))
    .join(',')
  const entities = ctx.environment.nearbyEntities.map(e => e.name).join(',')

  const environmentSummary = `${ctx.environment.time} ${ctx.environment.weather} Nearby players [${players}] Nearby entities [${entities}] Light ${ctx.environment.lightLevel}`

  return {
    selfSummary,
    environmentSummary,
  }
}
