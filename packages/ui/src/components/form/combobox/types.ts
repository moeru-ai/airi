import type { AcceptableValue } from 'reka-ui'

/**
 * Option group accepted by {@link Combobox}.
 *
 * @param T Value type shared by the group's child options.
 */
export interface ComboboxOptionGroupItem<T extends AcceptableValue> {
  /** Options rendered within this group. */
  children?: ComboboxOptionItem<T>[]
  /** Optional group heading rendered above child options. */
  groupLabel?: string
}

/**
 * Option rendered by {@link Combobox}.
 *
 * @param T Value type accepted by the underlying Reka combobox item.
 */
export interface ComboboxOptionItem<T extends AcceptableValue> {
  /** Optional secondary text shown below the label. */
  description?: string
  /** Prevents the option from being selected when true. */
  disabled?: boolean
  /** Iconify class name rendered before the label. */
  icon?: string
  /** User-visible label shown in the input and option row. */
  label: string
  /** Value passed through `v-model` when this option is selected. */
  value: T
}
