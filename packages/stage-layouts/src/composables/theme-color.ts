import { useTheme } from '@proj-airi/ui'
import Color from 'colorjs.io'

export function themeColorFromValue(value: string | { light: string, dark: string }): () => Promise<string> {
  return async () => {
    if (typeof value === 'string') {
      return value
    }
    else {
      const { isDark: dark } = useTheme()
      return dark.value ? value.dark : value.light
    }
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

