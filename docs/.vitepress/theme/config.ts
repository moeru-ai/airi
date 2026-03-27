import type { DefaultTheme } from 'vitepress'

interface ExtraThemeConfig {
  homepage: HomePageConfig
}

interface HomePageConfig {
  buttons: ButtonItem[]
}

export interface ButtonItem extends Link {
  primary?: boolean
}

export interface Link {
  text?: string
  link?: string

  /**
   * VitePress intercepts `<a>` tag clicks for SPA navigation, which can cause routing errors for external links.<br/>
   * Adding a `target` attribute allows the browser to handle the navigation natively, avoiding this problem.
   *
   * See:<br/>
   * https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#target<br/>
   * https://stackoverflow.com/questions/79348337/redirect-main-title-link-in-vitepress-to-my-personal-website/79386388#79386388
   */
  target?: string
}

export type ThemeConfig = DefaultTheme.Config & ExtraThemeConfig
