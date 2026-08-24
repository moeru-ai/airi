import Color from 'colorjs.io'

import { withRetry } from '@moeru/std'
import { useData } from 'vitepress'

export function themeColorFromPropertyOf(colorFromClass: string, property: string): () => Promise<string> {
  return async () => {
    const fetchUntilWidgetMounted = withRetry(() => {
      const widgets = document.querySelector(colorFromClass) as HTMLDivElement | undefined
      if (!widgets)
        throw new Error('Widgets element not found')

      return widgets
    }, { retry: 10, retryDelay: 1000 })

    const widgets = await fetchUntilWidgetMounted()
    return window.getComputedStyle(widgets).getPropertyValue(property)
  }
}

/**
 * Resolves a theme color from a static value or per-scheme values.
 *
 * `useData()` must run here (factory body, called from `setup()`): inside the
 * returned async closure the inject context is gone and it would throw.
 * Reading VitePress' `isDark` also avoids stray `useDark()` instances that
 * force the theme back to the system preference.
 */
export function themeColorFromValue(value: string | { light: string, dark: string }): () => Promise<string> {
  const { isDark } = useData()
  return async () => {
    if (typeof value === 'string') {
      return value
    }
    return isDark.value ? value.dark : value.light
  }
}

export function useThemeColor(colorFrom: () => string | Promise<string>) {
  async function updateThemeColor() {
    if (!('document' in globalThis) || globalThis.document == null)
      return
    if (!('window' in globalThis) || globalThis.window == null)
      return

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', new Color(await colorFrom()).to('srgb').toString({ format: 'hex' }))
  }

  return {
    updateThemeColor,
  }
}
