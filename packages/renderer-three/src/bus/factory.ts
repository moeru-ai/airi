import type { RendererCommands, RendererEvents } from './types'

import { createStickyBus } from './sticky-bus'

export function createRendererBus() {
  return {
    // downwards from stage-ui
    commandsBus: createStickyBus<RendererCommands>(),
    // Upwards to stage-ui
    eventsBus: createStickyBus<RendererEvents>(),
  }
}

export type RendererBus = ReturnType<typeof createRendererBus>
