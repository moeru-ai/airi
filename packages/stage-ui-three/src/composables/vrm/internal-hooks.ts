import type { VrmHook } from './hooks'

import { createVrmOutlineHook } from './outline'

export function resolveInternalVrmHooks(): readonly VrmHook[] {
  return [
    createVrmOutlineHook(),
  ]
}
