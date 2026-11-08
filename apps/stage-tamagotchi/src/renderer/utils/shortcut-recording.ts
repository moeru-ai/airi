import type { ShortcutAccelerator } from '@proj-airi/stage-shared/global-shortcut'

import { isMacOS } from 'std-env'

/**
 * Reads the accelerator that a shortcut recorder receives.
 * Returns `undefined` for a key repeat or a modifier key alone, so the recorder waits for the main key.
 *
 * @example
 * acceleratorFromKeyboardEvent(new KeyboardEvent('keydown', { code: 'Space', ctrlKey: true, shiftKey: true }))
 * // => { modifiers: ['ctrl', 'shift'], key: 'Space' }
 */
export function acceleratorFromKeyboardEvent(event: KeyboardEvent): ShortcutAccelerator | undefined {
  if (event.repeat || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key))
    return undefined

  const modifiers: ShortcutAccelerator['modifiers'] = []
  if (event.metaKey)
    modifiers.push(isMacOS ? 'cmd' : 'super')
  if (event.ctrlKey)
    modifiers.push('ctrl')
  if (event.altKey)
    modifiers.push('alt')
  if (event.shiftKey)
    modifiers.push('shift')

  return { modifiers, key: event.code }
}
