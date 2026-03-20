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
}

export type ThemeConfig = DefaultTheme.Config & ExtraThemeConfig
