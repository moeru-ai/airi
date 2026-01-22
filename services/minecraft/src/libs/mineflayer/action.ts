import type { z } from 'zod'

import type { Mineflayer } from './core'

type ActionResult = string | Promise<string>

export type ActionExecutionMode = 'async' | 'sync'

export interface Action {
  readonly name: string
  readonly description: string
  readonly execution: ActionExecutionMode
  readonly schema: z.ZodObject<any>
  readonly perform: (mineflayer: Mineflayer) => (...args: any[]) => ActionResult
}
