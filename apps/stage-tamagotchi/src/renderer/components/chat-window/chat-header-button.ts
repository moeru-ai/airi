/**
 * How a chat header button looks.
 *
 * - `plain`: a square button in a window title bar, such as the legacy chat window.
 * - `dock`: a round button in the dock of the floating chat. Its icon is neutral, and only the icon of a pressed one
 *   takes the theme color.
 */
export type ChatHeaderButtonVariant = 'plain' | 'dock'

/**
 * The classes of a chat header button.
 *
 * Use when:
 * - A button sits in a chat header, so it looks like its neighbors there.
 *
 * Returns:
 * - The classes for the variant, with the pressed look when `pressed` is `true`.
 * - Only a pressed button has a theme color icon. Hover shows the background and keeps the icon color, so a button that is
 *   not pressed never looks pressed.
 */
export function chatHeaderButtonClass(variant: ChatHeaderButtonVariant, pressed = false) {
  const base = [
    'flex items-center justify-center outline-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
    'text-base transition-colors transition-transform active:scale-95 disabled:opacity-50',
  ]
  if (variant === 'dock') {
    return [
      ...base,
      'size-7 rounded-full',
      'hover:bg-neutral-200 dark:hover:bg-neutral-800',
      pressed
        ? 'text-primary-500 dark:text-primary-400'
        : 'text-neutral-400 dark:text-neutral-500',
    ]
  }
  return [
    ...base,
    'h-7 w-7 rounded-md',
    pressed
      ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
      : 'text-neutral-400 hover:bg-neutral-200 dark:text-neutral-500 dark:hover:bg-neutral-800',
  ]
}
