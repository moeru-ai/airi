import type { ReflexContextState } from './context'

export type ReflexModeId = 'alert' | 'idle' | 'social' | 'wander' | 'work'

export function selectMode(ctx: ReflexContextState): ReflexModeId {
  if (ctx.threat.threatScore > 0)
    return 'alert'

  if (ctx.social.lastMessageAt && ctx.now - ctx.social.lastMessageAt < 15_000)
    return 'social'

  return 'idle'
}
