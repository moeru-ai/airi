import type { z } from 'zod'

import type { Mineflayer } from './core'

type ActionResult = string | Promise<string>

export interface Action {
  readonly name: string
  readonly description: string
  readonly schema: z.ZodObject<any>
  readonly readonly?: boolean
  readonly execution?: 'sync' | 'async'
  readonly perform: (mineflayer: Mineflayer) => (...args: any[]) => ActionResult
}
