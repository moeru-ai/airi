import type { ReflexContextState } from '../reflex/context'

export interface ConsciousContextView {
  selfSummary: string
  environmentSummary: string
}

export function buildConsciousContextView(ctx: ReflexContextState): ConsciousContextView {
  const pos = ctx.self.location
  const roundedPos = `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`
  const selfSummary = `Position ${roundedPos} Health ${ctx.self.health}/20 Food ${ctx.self.food}/20 Holding ${ctx.self.holding ?? 'nothing'}`

  const players = ctx.environment.nearbyPlayers.map(p => p.name).join(',')
  const entities = ctx.environment.nearbyEntities.map(e => e.name).join(',')

  const gaze = ctx.environment.nearbyPlayersGaze
    .map((g) => {
      const hit = g.hitBlock
        ? `${g.hitBlock.name}@(${Math.round(g.hitBlock.pos.x)}, ${Math.round(g.hitBlock.pos.y)}, ${Math.round(g.hitBlock.pos.z)})`
        : 'air'

      if (g.hitBlock)
        return `${g.name}->${hit}`

      const lp = `(${Math.round(g.lookPoint.x)}, ${Math.round(g.lookPoint.y)}, ${Math.round(g.lookPoint.z)})`
      return `${g.name}->${hit} lookPoint${lp}`
    })
    .join(' | ')
  const gazeSummary = ctx.environment.nearbyPlayersGaze.length > 0 ? ` Nearby player gaze [${gaze}]` : ''

  const environmentSummary = `${ctx.environment.time} ${ctx.environment.weather} Nearby players [${players}] Nearby entities [${entities}] Light ${ctx.environment.lightLevel}${gazeSummary}`

  return {
    selfSummary,
    environmentSummary,
  }
}
