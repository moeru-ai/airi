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
}

export type ThemeConfig = DefaultTheme.Config & ExtraThemeConfig
