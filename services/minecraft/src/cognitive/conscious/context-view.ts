import type { ReflexContextState } from '../reflex/context'

export interface ConsciousContextView {
  selfSummary: string
  environmentSummary: string
}

export function buildConsciousContextView(ctx: ReflexContextState): ConsciousContextView {
  const selfSummary = `Position ${String(ctx.self.location)} Health ${ctx.self.health}/20 Food ${ctx.self.food}/20 Oxygen ${ctx.self.oxygen}/20 Holding ${ctx.self.holding ?? 'nothing'}`

  const players = ctx.environment.nearbyPlayers.map(p => p.name).join(',')
  const entities = ctx.environment.nearbyEntities.map(e => e.name).join(',')
  const environmentSummary = `${ctx.environment.time} ${ctx.environment.weather} Nearby players [${players}] Nearby entities [${entities}] Light ${ctx.environment.lightLevel}`

  return {
    selfSummary,
    environmentSummary,
  }
}
