import type { ShortTermMemoryOptions } from '../../types/short-term'
import type { ListClient } from './base-short-term.provider'

import { kv as defaultKv } from '@vercel/kv'

import { BaseShortTermMemoryProvider } from './base-short-term.provider'

export interface VercelKvShortTermMemoryOptions extends ShortTermMemoryOptions {
  client?: ListClient
}

export class VercelKvShortTermMemoryProvider extends BaseShortTermMemoryProvider {
  constructor(options: VercelKvShortTermMemoryOptions = {}) {
    super(options.client ?? (defaultKv as unknown as ListClient), options)
  }
}
