/**
 * The icon buttons of the conversation list change only the color of their icon on hover.
 * A row or a surface under them already shows the hover, so the button adds no second layer.
 *
 * `IconButton` of `@proj-airi/ui` does not fit: it keeps its icon at 16px and its box at the sizes of `BasicButton`.
 * The list needs 44px buttons with 20px icons on a phone, and 32px buttons in the popover.
 */
export const iconButtonClasses = [
  'shrink-0 flex items-center justify-center rounded-full bg-transparent outline-none',
  'transition-[color,opacity] duration-200 motion-reduce:transition-none',
  'focus-visible:outline-2 focus-visible:outline-primary-500',
]

/** The icon color of an icon button at rest, and the theme color on hover. */
export const quietIconClasses = 'text-neutral-400 hover:text-primary-500 dark:text-neutral-500 dark:hover:text-primary-400'
