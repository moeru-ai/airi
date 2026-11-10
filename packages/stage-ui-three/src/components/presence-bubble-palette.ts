import type { PresenceBubblePalette } from '@proj-airi/stage-shared'
import type { InjectionKey } from 'vue'

/**
 * Supplies the bubble's colours, read on demand.
 *
 * The Tres renderer builds Three objects from a component's template, so the
 * elements the colours are read from have to be mounted outside the canvas. The
 * bubble asks for them through this instead of owning them.
 */
export const presenceBubblePaletteKey: InjectionKey<() => PresenceBubblePalette> = Symbol('presence-bubble-palette')
