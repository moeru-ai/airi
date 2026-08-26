/**
 * Option rendered by {@link SelectTab}.
 *
 * @param T String or number value emitted through the tab group's `v-model`.
 */
export interface SelectTabOption<T extends string | number> {
  /** User-visible tab label. */
  label: string
  /** Value passed through `v-model` when this tab is selected. */
  value: T
  /** Optional secondary text reserved for consumers that render richer tab content. */
  description?: string
  /** Iconify class name rendered before the label. */
  icon?: string
}
