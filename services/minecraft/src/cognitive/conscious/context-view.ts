import type { ReflexContextState } from '../reflex/context'

export interface ConsciousContextView {
  selfSummary: string
  environmentSummary: string
}

export function buildConsciousContextView(ctx: ReflexContextState): ConsciousContextView {
  const pos = ctx.self.location
  const roundedPos = `(${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`
  const selfSummary = `Position ${roundedPos} Health ${ctx.self.health}/20 Food ${ctx.self.food}/20 and I'm holding ${ctx.self.holding ?? 'nothing'}`

  const players = ctx.environment.nearbyPlayers
    .map(p => (p.holding ? `${p.name} is holding (${p.holding})` : p.name))
    .join(',')
  const entities = ctx.environment.nearbyEntities.map(e => e.name).join(',')

  const gaze = ctx.environment.nearbyPlayersGaze
    .map((g) => {
      if (g.hitBlock) {
        const block = `${g.hitBlock.name} at (${Math.round(g.hitBlock.pos.x)}, ${Math.round(g.hitBlock.pos.y)}, ${Math.round(g.hitBlock.pos.z)})`
        return `${g.name} is looking at ${block}`
      }

      const lp = `(${Math.round(g.lookPoint.x)}, ${Math.round(g.lookPoint.y)}, ${Math.round(g.lookPoint.z)})`
      return `${g.name} is staring into the air around ${lp}`
    })
    .join('\n')
  const gazeSummary = ctx.environment.nearbyPlayersGaze.length > 0 ? `\nNearby player gaze:\n${gaze}` : ''

  const environmentSummary = `${ctx.environment.time} ${ctx.environment.weather} Nearby players [${players}] Nearby entities [${entities}] Light ${ctx.environment.lightLevel}${gazeSummary}`

  return {
    selfSummary,
    environmentSummary,
  }
}
