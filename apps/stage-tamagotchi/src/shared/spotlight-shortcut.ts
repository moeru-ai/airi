import type { ShortcutAccelerator, ShortcutModifier } from '@proj-airi/stage-shared/global-shortcut'

const safeModifiers = new Set<ShortcutModifier>(['alt', 'cmd', 'ctrl', 'super'])

export function isSafeSpotlightAccelerator(accelerator: ShortcutAccelerator): boolean {
  return accelerator.modifiers.some(modifier => safeModifiers.has(modifier))
}
