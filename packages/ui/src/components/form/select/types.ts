import type { AcceptableValue } from 'reka-ui'

/**
 * Option group accepted by {@link Select}.
 *
 * @param T Value type shared by the group's child options.
 */
export interface SelectOptionGroupItem<T extends AcceptableValue> {
  /** Options rendered within this group. */
  children?: SelectOptionItem<T>[]
  /** Optional group heading rendered above child options. */
  groupLabel?: string
}

/**
 * Option rendered by {@link Select} and {@link SelectOption}.
 *
 * @param T Value type accepted by the underlying Reka select item.
 */
export interface SelectOptionItem<T extends AcceptableValue> {
  /** Optional secondary text shown below the label. */
  description?: string
  /** Prevents the option from being selected when true. */
  disabled?: boolean
  /** Iconify class name rendered before the label. */
  icon?: string
  /** User-visible label shown in the trigger and option row. */
  label: string
  /** Value passed through `v-model` when this option is selected. */
  value: T
}
