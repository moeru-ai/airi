import type { z } from 'zod'

import type { Mineflayer } from './core'

export interface Action {
  readonly description: string
  readonly execution?: 'async' | 'sync'
  readonly followControl?: 'detach' | 'pause'
  readonly name: string
  readonly perform: (mineflayer: Mineflayer) => (...args: any[]) => ActionResult
  readonly readonly?: boolean
  readonly schema: z.ZodObject<any>
}

type ActionResult = Promise<unknown> | unknown
