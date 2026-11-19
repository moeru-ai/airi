import type { DockItemEdge, DockOrientation, DockSize, DockVariant } from './context'

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

// The classes are written out in full, so UnoCSS finds them in the source.
const edgeItemCorners: Record<DockOrientation, Record<DockSize, Record<DockItemEdge, string>>> = {
  vertical: {
    sm: { start: 'rounded-t-[14px] rounded-b-[6px]', end: 'rounded-b-[14px] rounded-t-[6px]' },
    md: { start: 'rounded-t-[18px] rounded-b-[6px]', end: 'rounded-b-[18px] rounded-t-[6px]' },
  },
  horizontal: {
    sm: { start: 'rounded-l-[14px] rounded-r-[6px]', end: 'rounded-r-[14px] rounded-l-[6px]' },
    md: { start: 'rounded-l-[18px] rounded-r-[6px]', end: 'rounded-r-[18px] rounded-l-[6px]' },
  },
}

/**
 * The corners of an item that sits at an end of a `Dock` and is not round, for example a drag handle.
 *
 * The round end of a dock and a round button share a center, so the hover background keeps the same gap to the edge.
 * The outer corners of the item take half the size of a button, so they share that center too. The inner corners take
 * 6px. Make the item at least 6px longer than half a button along the dock.
 *
 * `edge` is the end that the item shows at: `start` is the top of a vertical dock, or the left of a horizontal dock.
 */
export function dockEdgeItemClasses(size: DockSize, orientation: DockOrientation, edge: DockItemEdge) {
  return edgeItemCorners[orientation][size][edge]
}
