import type { ReflexBehavior } from '../types/behavior'

export const teabagBehavior: ReflexBehavior = {
  id: 'teabag',
  modes: ['social', 'idle'],
  cooldownMs: 5000,

  when: (ctx) => {
    // Check if we recently received a teabag signal
    // Check if we recently received a teabag signal
    if (ctx.social.lastGesture === 'teabag') {
      const now = Date.now()
      const signalAge = now - (ctx.social.lastGestureAt || 0)

      // Only respond if signal is fresh (< 2s)
      return signalAge < 2000
    }
    return false
  },

  score: () => {
    // Higher priority than LookAt (50)
    return 60
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
