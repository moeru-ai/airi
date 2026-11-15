import type { DockVariant } from './context'

/**
 * The hover background and the icon color of an item in a `Dock`. `DockButton` uses them, and a custom item, such as a
 * drag handle, uses them so its icon matches its neighbors.
 *
 * Only the icon of a pressed item takes the theme color. A hover shows a neutral background and keeps the icon color.
 * On a `blurry` dock, icons at rest have the colors of the Controls Island icons.
 */
export function dockItemClasses(variant: DockVariant = 'default', pressed = false) {
  return [
    variant === 'blurry'
      ? 'hover:bg-neutral-900/8 dark:hover:bg-white/10'
      : 'hover:bg-neutral-200 dark:hover:bg-neutral-800',
    pressed
      ? 'text-primary-500 dark:text-primary-400'
      : variant === 'blurry'
        ? 'text-neutral-800 dark:text-neutral-300'
        : 'text-neutral-400 dark:text-neutral-500',
  ]
}
