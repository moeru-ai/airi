import type { ReflexContextState } from './context'

export type ReflexModeId = 'idle' | 'social' | 'alert'

export function selectMode(ctx: ReflexContextState): ReflexModeId {
  if (ctx.threat.threatScore > 0)
    return 'alert'

  if (ctx.social.lastMessageAt && ctx.now - ctx.social.lastMessageAt < 15_000)
    return 'social'

  return 'idle'
}
