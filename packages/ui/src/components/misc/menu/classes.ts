/**
 * The row look of every item in a `DropdownMenu`. Highlight follows Reka's `data-highlighted`, and a disabled item
 * dims through `data-disabled`.
 */
export const menuItemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'data-[disabled]:cursor-default data-[disabled]:opacity-50',
  'transition-colors duration-150 ease-in-out motion-reduce:transition-none',
]
