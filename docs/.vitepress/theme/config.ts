import type { DefaultTheme } from 'vitepress'

interface ExtraThemeConfig {
  homepage: HomePageConfig
}

interface HomePageConfig {
  buttons: ButtonItem[]
}

export interface ButtonItem {
  text?: string
  link?: string
  primary?: boolean
  target?: string

  /**
   * If the link is an external link, but has the same origin as current site,
   * it will be treated as an internal route by default.
   * In order to prevent the bad jump, we use window.location.replace(link).
   */
  sameOriginExternal?: boolean
}

export type ThemeConfig = DefaultTheme.Config & ExtraThemeConfig
