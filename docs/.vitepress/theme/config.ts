import type { DefaultTheme } from 'vitepress'

interface ExtraThemeConfig {
  homepage: HomePageConfig
}

interface HomePageConfig {
  buttons: ButtonItem[]
}

export type ButtonItem = {
  primary?: boolean
} & Link

export interface Link {
  text?: string
  link?: string

  /**
   * VitePress在SPA内部处理导航时会劫持<a>标签的点击事件，导致外部链接被Vue Router识别为内部路由，产生路由错误。<br/>
   * 可以通过给<a>标签增加target属性让浏览器原生处理跳转的方式避免此问题。
   *
   * 参见：<br/>
   * https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#target<br/>
   * https://stackoverflow.com/questions/79348337/redirect-main-title-link-in-vitepress-to-my-personal-website/79386388#79386388
   */
  target?: string
}

export type ThemeConfig = DefaultTheme.Config & ExtraThemeConfig
