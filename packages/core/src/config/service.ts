import type { AiriConfig } from './schema'

import { ConfigSchema } from './schema'

export interface ConfigBackend {
  get: () => Promise<unknown> // raw value from storage
  set: (value: unknown) => Promise<void> // raw write
  subscribe?: (cb: () => void) => () => void // optional change watch
}

export class ConfigService {
  constructor(private backend: ConfigBackend) {}

  async get(): Promise<AiriConfig> {
    const raw = await this.backend.get()
    const parsed = ConfigSchema.safeParse(raw ?? {})
    if (!parsed.success)
      throw parsed.error
    return parsed.data
  }

  async set(next: AiriConfig): Promise<void> {
    const parsed = ConfigSchema.parse(next)
    await this.backend.set(parsed)
  }

  subscribe(cb: () => void) {
    return this.backend.subscribe?.(cb) ?? (() => {})
  }
}
