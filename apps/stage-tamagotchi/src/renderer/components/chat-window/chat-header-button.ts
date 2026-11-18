/**
 * How a chat header button looks.
 *
 * - `plain`: a square button in a window title bar, such as the legacy chat window.
 * - `dock`: a `DockButton` of `@proj-airi/ui` in the dock of the floating chat.
 */
export type ChatHeaderButtonVariant = 'plain' | 'dock'

/**
 * The classes of a `plain` chat header button.
 *
 * Use when:
 * - A button sits in a chat title bar, so it looks like its neighbors there.
 *
 * Returns:
 * - The classes, with the pressed look when `pressed` is `true`.
 */
export function chatHeaderButtonClass(pressed = false) {
  return [
    'flex items-center justify-center outline-none',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
    'text-base transition-colors transition-transform active:scale-95 disabled:opacity-50',
    'h-7 w-7 rounded-md',
    pressed
      ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300'
      : 'text-neutral-400 hover:bg-neutral-200 dark:text-neutral-500 dark:hover:bg-neutral-800',
  ]
}
