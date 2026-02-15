import type { MineflayerWithAgents } from '../../types'
import type { ReflexContext } from '../context'
import type { ReflexModeId } from '../modes'

export interface ReflexApi {
  bot: MineflayerWithAgents
  context: ReflexContext
}

export interface ReflexBehavior {
  id: string
  modes: ReflexModeId[]
  cooldownMs?: number
  when: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => boolean
  score: (ctx: ReturnType<ReflexContext['getSnapshot']>, api?: ReflexApi) => number
  run: (api: ReflexApi) => Promise<void> | void
}

export interface BehaviorRunRecord {
  lastRunAt: number
}
