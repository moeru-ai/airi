import type { ReflexBehavior } from '../types/behavior'

export const greetingBehavior: ReflexBehavior = {
  id: 'greeting',
  modes: ['social'],
  cooldownMs: 10_000,
  when: (ctx) => {
    const msg = ctx.social.lastMessage
    if (!msg)
      return false

    const lower = msg.toLowerCase().trim()
    return lower === 'hi' || lower === 'hello'
  },
  score: (ctx) => {
    if (!ctx.social.lastSpeaker)
      return 0

    const lastGreetAt = ctx.social.lastGreetingAtBySpeaker[ctx.social.lastSpeaker]
    if (lastGreetAt && ctx.now - lastGreetAt < 10_000)
      return 0

    return 10
  },
  run: ({ bot, context }) => {
    const snap = context.getSnapshot()
    const speaker = snap.social.lastSpeaker
    if (!speaker)
      return

    bot.bot.chat('Hi there! (Reflex)')

    context.updateSocial({
      lastGreetingAtBySpeaker: {
        ...snap.social.lastGreetingAtBySpeaker,
        [speaker]: snap.now,
      },
    })
  },
}
