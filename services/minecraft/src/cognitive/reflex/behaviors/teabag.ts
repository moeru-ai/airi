import type { ReflexBehavior } from '../types/behavior'

export const teabagBehavior: ReflexBehavior = {
  id: 'teabag',
  modes: ['social', 'idle'],
  cooldownMs: 5000,

  when: (_ctx, api) => {
    // Check if any player is teabagging with high confidence
    if (!api?.perception)
      return false
    const teabaggers = api.perception.entitiesWithBelief('teabag', 0.6)
    return teabaggers.length > 0
  },

  score: (_ctx, api) => {
    // Higher priority than LookAt (50), scaled by confidence
    if (!api?.perception)
      return 0
    const teabaggers = api.perception.entitiesWithBelief('teabag', 0.6)
    if (teabaggers.length === 0)
      return 0
    // Use highest confidence as score boost
    const maxConfidence = Math.max(...teabaggers.map(e => e.beliefs.teabag?.confidence ?? 0))
    return 60 + (maxConfidence * 20)
  },

  run: async ({ bot }) => {
    // Perform rapid squats
    for (let i = 0; i < 4; i++) {
      bot.bot.setControlState('sneak', true)
      await new Promise(resolve => setTimeout(resolve, 150))
      bot.bot.setControlState('sneak', false)
      await new Promise(resolve => setTimeout(resolve, 150))
    }
  },
}
