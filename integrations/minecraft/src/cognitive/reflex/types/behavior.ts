import type { MineflayerWithAgents } from '../../types'
import type { ReflexContext } from '../context'
import type { ReflexModeId } from '../modes'

export interface BehaviorRunRecord {
  lastRunAt: number
}

export interface ReflexApi {
  bot: MineflayerWithAgents
  context: ReflexContext
}

export interface ReflexBehavior {
  cooldownMs?: number
  id: string
  modes: ReflexModeId[]
  run: (api: ReflexApi) => Promise<void> | void
  score: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => number
  when: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => boolean
}
