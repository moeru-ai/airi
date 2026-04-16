import type { MaybeRefOrGetter } from 'vue'

import { toValue, watchEffect } from 'vue'

/**
 * Composable for managing CSS custom properties (variables) with reactivity and cleanup.
 *
 * @example
 * // Basic usage - sets variables on root element
 * const { stop } = useCssVariables({
 *   '--primary-color': '#ff0000',
 *   '--spacing-unit': '16px',
 *   '--is-visible': '1'
 * })
 *
 * @example
 * // Scoped to an element
 * const element = ref<HTMLElement>()
 * useCssVariables(
 *   { 'color-1': '#666', 'color-2': '#ccc' },
 *   { elementGetter: element } // or with prefix: `{ prefix: '--my-component-' }`
 * )
 *
 * @example
 * // With reactive values
 * const props = defineProps<{ theme: 'light' | 'dark' }>()
 * const themeVars = computed(() => ({
 *   '--bg-color': props.theme === 'light' ? '#fff' : '#000',
 *   '--text-color': props.theme === 'light' ? '#000' : '#fff'
 * }))
 * useCssVariables(themeVars)
 *
 * @param variableGetter
 * - A reactive object containing CSS variable name-value pairs or a getter for such object.
 * Variable names should include the '--' prefix unless `options.prefix` is supplied.
 * @param options
 * - Configuration options for the CSS variables.
 * @param options.elementGetter
 * - The DOM element to apply the CSS variables to. Can be used with `useTemplateRef` or a getter.
 * Defaults to `document.documentElement` (:root).
 * @param options.prefix
 * A string to prepend to all variable names for scoping.
 * '--' will NOT be added, and the variable name is concatenated directly without '-'.
 *
 * @returns
 * A function to stop and clean up manually.
 * When the component unmounts, `stop` is called automatically.
 *
 * @remarks
 * - Performance: Consider memoizing the `variables` object with `computed` if it involves
 *   expensive calculations or creates new objects on each render.
 */
export function useCssVariables(
  variableGetter: MaybeRefOrGetter<Record<string, string | undefined>>,
  options?: { elementGetter?: MaybeRefOrGetter<HTMLElement | null>, prefix?: string },
) {
  const stopHandle = watchEffect((onCleanup) => {
    const appliedVars: string[] = []
    let target: HTMLElement | null
    if (options?.elementGetter)
      target = toValue(options.elementGetter)
    else target = document.documentElement
    if (!target)
      return
    const validVariables = Object.entries(toValue(variableGetter)).filter(([_key, val]) => val != null) as [string, string][] // also removes `undefined`
    validVariables.forEach(([name, val]) => {
      const varFullName = `${options?.prefix ?? ''}${name}`
      target.style.setProperty(varFullName, val)
      appliedVars.push(varFullName)
    })
    onCleanup(() => {
      appliedVars.forEach(v => target.style.removeProperty(v))
    })
  })

  return { stop: stopHandle }
}
