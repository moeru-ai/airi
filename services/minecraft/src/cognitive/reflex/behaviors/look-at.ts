import type { ReflexBehavior } from '../types/behavior'

export const lookAtBehavior: ReflexBehavior = {
  id: 'look-at',
  modes: ['idle', 'social'],
  cooldownMs: 1000,

  when: (ctx) => {
    // Check if we have a recent attention signal
    const { lastSignalType, lastSignalAt } = ctx.attention
    if (!lastSignalType || !lastSignalAt)
      return false

    // Must be fresh (within 2 seconds)
    if (ctx.now - lastSignalAt > 2000)
      return false

    // Respond to entity_attention signals
    return lastSignalType === 'entity_attention'
  },

  score: () => {
    // High priority but not override-level (100)
    // Allows critical survival behaviors to take precedence
    return 50
  },

  run: async ({ bot, context }) => {
    const { lastSignalSourceId } = context.getSnapshot().attention

    if (!lastSignalSourceId)
      return

    // Find the entity
    const target = bot.bot.entities[Number(lastSignalSourceId)]
    if (!target)
      return

    // Look at the entity smoothly
    await bot.bot.lookAt(target.position.offset(0, target.height * 0.85, 0), true)
  },
}
