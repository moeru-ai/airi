import type { DefaultTheme } from 'vitepress'

import { join, posix, resolve } from 'node:path'
import { env } from 'node:process'

import i18n from '@intlify/unplugin-vue-i18n/vite'
import anchor from 'markdown-it-anchor'
import unocss from 'unocss/vite'
import yaml from 'unplugin-yaml/vite'

import { footnote } from '@mdit/plugin-footnote'
import { tasklist } from '@mdit/plugin-tasklist'
import { defineConfig, postcssIsolateStyles } from 'vitepress'

import { version } from '../../package.json'
import { teamMembers } from './contributors'
import {
  discord,
  github,
  ogImage,
  ogUrl,
  projectDescription,
  projectName,
  projectShortName,
  releases,
  x,
} from './meta'
import { frontmatterAssets } from './plugins/vite-frontmatter-assets'

function withBase(url: string) {
  return env.BASE_URL
    ? env.BASE_URL.endsWith('/')
      ? posix.join(env.BASE_URL.replace(/\/$/, ''), url)
      : posix.join(env.BASE_URL, url)
    : url
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  cleanUrls: true,
  ignoreDeadLinks: true,
  title: projectName,
  description: projectDescription,
  titleTemplate: projectShortName,
  head: [
    ['meta', { name: 'theme-color', content: '#0b0d0f' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: projectName }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'author', content: `${teamMembers.map(c => c.name).join(', ')} and ${projectName} contributors` }],
    ['meta', { name: 'keywords', content: '' }],
    ['meta', { property: 'og:title', content: projectName }],
    ['meta', { property: 'og:site_name', content: projectName }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { property: 'og:description', content: projectDescription }],
    ['meta', { property: 'og:url', content: ogUrl }],
    ['meta', { name: 'twitter:title', content: projectName }],
    ['meta', { name: 'twitter:description', content: projectDescription }],
    ['meta', { name: 'twitter:image', content: ogImage }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: '#ffffff' }],
    // Proxying Plausible through Netlify | Plausible docs
    // https://plausible.io/docs/proxy/guides/netlify
    ['script', { async: '', src: 'https://moeru-ai-airi-helper.kwaa.workers.dev/remote-assets/page-external-data/js/script.js' }],
    ['script', {}, `
      window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
      plausible.init({
        endpoint: "https://moeru-ai-airi-helper.kwaa.workers.dev/api/v1/page-external-data/submit"
      })
    `],
    ['script', {}, `
      ;(function () {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        const setting = localStorage.getItem('vueuse-color-scheme') || 'auto'
        if (setting === 'light' || (prefersDark && setting !== 'dark')) {
          document.querySelector('#themeColor')?.setAttribute('content', 'rgb(255,255,255)')
        }
      })()
    `],
  ],
  base: env.BASE_URL || '/',
  lastUpdated: true,
  sitemap: {
    hostname: ogUrl,
  },
  locales: {
    'root': {
      label: 'English',
      lang: 'en',
      themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { text: 'Docs', link: withBase('/en/docs/overview/') },
          { text: 'Blog', link: withBase('/en/blog/') },
          {
            text: `v${version}`,
            items: [
              { text: 'Release Notes ', link: releases },
            ],
          },
          {
            text: 'About',
            items: [
              { text: 'Privacy Policy', link: withBase('/en/about/privacy') },
              { text: 'Terms of Use', link: withBase('/en/about/terms') },
            ],
          },
        ],
        outline: {
          level: 'deep',
          label: 'このページの内容',
        },
        docFooter: {
          prev: '前のページ',
          next: '次のページ',
        },
        editLink: {
          pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
          text: 'GitHub でこのページを編集',
        },
        lastUpdated: {
          text: '最終更新',
        },
        darkModeSwitchLabel: '外観モード',
        sidebarMenuLabel: 'メニュー',
        returnToTopLabel: 'トップに戻る',
        langMenuLabel: '言語を変更',
        logo: withBase('/favicon.svg'),

        sidebar: [
          {
            text: 'Overview',
            icon: 'lucide:rocket',
            items: [
              { text: 'Introduction', link: withBase('/en/docs/overview/') },
              {
                text: 'Guide',
                items: [
                  {
                    text: 'Guide to Desktop version',
                    link: withBase('/en/docs/overview/guide/tamagotchi/'),
                    items: [],
                  },
                  {
                    text: 'Guide to Web version',
                    link: withBase('/en/docs/overview/guide/web/'),
                    items: [],
                  },
                ],
              },
              {
                text: 'Contributing',
                items: [
                  { text: 'Contribute Code', link: withBase('/en/docs/overview/contributing/') },
                  {
                    text: 'Contribute Design',
                    items: [
                      { text: 'Resources', link: withBase('/en/docs/overview/contributing/design-guidelines/resources') },
                      { text: 'Tools', link: withBase('/en/docs/overview/contributing/design-guidelines/tools') },
                    ],
                  },
                ],
              },
              { text: 'About AI VTuber', link: withBase('/en/docs/overview/about-ai-vtuber') },
              { text: 'About Neuro-sama', link: withBase('/en/docs/overview/about-neuro-sama') },
            ],
          },
          {
            text: 'Manual',
            icon: 'lucide:book-open',
            items: [
              { text: 'Versions', link: withBase('/en/docs/manual/versions') },
            ],
          },
          {
            text: 'Chronicles',
            icon: 'lucide:calendar-days',
            items: [
              { text: 'Initial Publish v0.1.0', link: withBase('/en/docs/chronicles/version-v0.1.0/') },
              { text: 'Before Story v0.0.1', link: withBase('/en/docs/chronicles/version-v0.0.1/') },
            ],
          },
          {
            text: 'Characters',
            icon: 'lucide:scan-face',
            link: withBase('/en/characters/'),
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],
      },
    },
    'zh-Hans': {
      label: '简体中文',
      lang: 'zh-Hans',
      themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { text: '文档', link: withBase('/zh-Hans/docs/overview/') },
          { text: '博客 / 开发日志', link: withBase('/zh-Hans/blog/') },
          {
            text: `v${version}`,
            items: [
              { text: '发布说明 ', link: releases },
            ],
          },
          {
            text: '关于',
            items: [
              { text: '隐私政策', link: withBase('/zh-Hans/about/privacy') },
              { text: '使用条款', link: withBase('/zh-Hans/about/terms') },
            ],
          },
        ],
        outline: {
          level: 'deep',
        },
        logo: withBase('/favicon.svg'),

        sidebar: [
          {
            text: '概览',
            icon: 'lucide:rocket',
            items: [
              { text: '介绍', link: withBase('/zh-Hans/docs/overview/') },
              {
                text: '指南',
                items: [
                  {
                    text: '桌面版上手指南',
                    link: withBase('/zh-Hans/docs/overview/guide/tamagotchi/'),
                    items: [],
                  },
                  {
                    text: '网页版上手指南',
                    link: withBase('/zh-Hans/docs/overview/guide/web/'),
                    items: [],
                  },
                ],
              },
              {
                text: '参与贡献',
                items: [
                  { text: '贡献代码', link: withBase('/zh-Hans/docs/overview/contributing/') },
                  { text: '贡献设计', link: withBase('/zh-Hans/docs/overview/contributing/design-guidelines/') },
                  { text: '参考资源', link: withBase('/zh-Hans/docs/overview/contributing/design-guidelines/resources') },
                  { text: '工具', link: withBase('/zh-Hans/docs/overview/contributing/design-guidelines/tools') },
                ],
              },
              { text: '有关 AI VTuber', link: withBase('/zh-Hans/docs/overview/about-ai-vtuber') },
              { text: '有关 Neuro-sama', link: withBase('/zh-Hans/docs/overview/about-neuro-sama') },
            ],
          },
          {
            text: '指南',
            icon: 'lucide:book-open',
            items: [
              { text: '不同的版本', link: withBase('/zh-Hans/docs/manual/versions') },
            ],
          },
          {
            text: '编年史',
            icon: 'lucide:calendar-days',
            items: [
              { text: '首次公开 v0.1.0', link: withBase('/zh-Hans/docs/chronicles/version-v0.1.0/') },
              { text: '先前的故事 v0.0.1', link: withBase('/zh-Hans/docs/chronicles/version-v0.0.1/') },
            ],
          },
          {
            text: '角色',
            icon: 'lucide:scan-face',
            link: withBase('/zh-Hans/characters/'),
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],
      },
    },
    'ja': {
      label: '日本語',
      lang: 'ja',
      themeConfig: {
        // https://vitepress.dev/reference/default-theme-config
        nav: [
          { text: 'ドキュメント', link: withBase('/ja/docs/overview/') },
          { text: 'ブログ', link: withBase('/ja/blog/') },
          {
            text: `v${version}`,
            items: [
              { text: 'リリースノート', link: releases },
            ],
          },
          {
            text: '概要',
            items: [
              { text: 'プライバシーポリシー', link: withBase('/ja/about/privacy') },
              { text: '利用規約', link: withBase('/ja/about/terms') },
            ],
          },
        ],
        outline: {
          level: 'deep',
        },
        logo: withBase('/favicon.svg'),

        sidebar: [
          {
            text: '概要',
            icon: 'lucide:rocket',
            items: [
              { text: 'はじめに', link: withBase('/ja/docs/overview/') },
              {
                text: 'ガイド',
                items: [
                  {
                    text: 'デスクトップ版のガイド',
                    link: withBase('/ja/docs/overview/guide/tamagotchi/'),
                    items: [],
                  },
                  {
                    text: 'Web 版のガイド',
                    link: withBase('/ja/docs/overview/guide/web/'),
                    items: [],
                  },
                ],
              },
              {
                text: 'コントリビューション',
                items: [
                  { text: 'コードで貢献', link: withBase('/ja/docs/overview/contributing/') },
                  { text: 'デザインで貢献', link: withBase('/ja/docs/overview/contributing/design-guidelines/') },
                  { text: 'リソース', link: withBase('/ja/docs/overview/contributing/design-guidelines/resources') },
                  { text: 'ツール', link: withBase('/ja/docs/overview/contributing/design-guidelines/tools') },
                ],
              },
              { text: 'AI VTuber について', link: withBase('/ja/docs/overview/about-ai-vtuber') },
              { text: 'Neuro-sama について', link: withBase('/ja/docs/overview/about-neuro-sama') },
            ],
          },
          {
            text: 'マニュアル',
            icon: 'lucide:book-open',
            items: [
              { text: 'バージョン一覧', link: withBase('/ja/docs/manual/versions') },
            ],
          },
          {
            text: '年表',
            icon: 'lucide:calendar-days',
            items: [
              { text: '初公開 v0.1.0', link: withBase('/ja/docs/chronicles/version-v0.1.0/') },
              { text: '前日譚 v0.0.1', link: withBase('/ja/docs/chronicles/version-v0.0.1/') },
            ],
          },
          {
            text: 'キャラクター',
            icon: 'lucide:scan-face',
            link: withBase('/en/characters/'),
          },
        ] as (DefaultTheme.SidebarItem & { icon?: string })[],
      },
    },
  },
  themeConfig: {
    socialLinks: [
      { icon: 'x', link: x },
      { icon: 'discord', link: discord },
      { icon: 'github', link: github },
    ],

    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/moeru-ai/airi/edit/main/docs/content/:path',
    },
  },
  srcDir: 'content',
  appearance: 'dark',
  markdown: {
    theme: {
      light: 'catppuccin-latte',
      dark: 'catppuccin-mocha',
    },
    headers: {
      level: [2, 3, 4, 5, 6],
    },
    config(md) {
      md.use(tasklist)
      md.use(footnote)
    },
    anchor: {
      callback(token) {
        // set tw `group` modifier to heading element
        token.attrSet(
          'class',
          'group relative border-none mb-4 lg:-ml-2 lg:pl-2 lg:pr-2',
        )
      },
      permalink: anchor.permalink.linkInsideHeader({
        class:
          'header-anchor [&_span]:focus:opacity-100 [&_span_>_span]:focus:outline',
        symbol: `<span class="absolute top-0 -ml-8 hidden items-center border-0 opacity-0 group-hover:opacity-100 focus:opacity-100 lg:flex" style="transition: all 0.2s ease-in-out;">&ZeroWidthSpace;<span class="flex h-6 w-6 items-center justify-center rounded-md outline-2 outline-primary text-green-400 shadow-sm  hover:text-green-700 hover:shadow dark:bg-primary/20 dark:text-primary/80 dark:shadow-none dark:hover:bg-primary/40 dark:hover:text-primary"><svg width="12" height="12" fill="none" aria-hidden="true"><path d="M3.75 1v10M8.25 1v10M1 3.75h10M1 8.25h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></span></span>`,
        renderAttrs: (slug, state) => {
          // From: https://github.com/vuejs/vitepress/blob/256d742b733bfb62d54c78168b0e867b8eb829c9/src/node/markdown/markdown.ts#L263
          // Find `heading_open` with the id identical to slug
          const idx = state.tokens.findIndex((token) => {
            const attrs = token.attrs
            const id = attrs?.find(attr => attr[0] === 'id')
            return id && slug === id[1]
          })
          // Get the actual heading content
          const title = state.tokens[idx + 1]!.content
          return {
            'aria-label': `Permalink to "${title}"`,
          }
        },
      }),
    },
  },
  transformPageData(pageData) {
    if (pageData.frontmatter.sidebar != null)
      return

    // hide sidebar on showcase page
    pageData.frontmatter.sidebar = pageData.frontmatter.layout !== 'showcase'
  },
  vite: {
    resolve: {
      alias: {
        '@proj-airi/stage-ui/components': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'components')),
        '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
      },
    },
    plugins: [
      // Thanks https://github.com/intlify/vue-i18n/issues/1205#issuecomment-2707075660
      i18n({ runtimeOnly: true, compositionOnly: true, fullInstall: true, ssr: true }),
      unocss(),
      yaml(),
      frontmatterAssets(),
    ],
    css: {
      postcss: {
        plugins: [
          postcssIsolateStyles({ includeFiles: [/vp-doc\.css/] }),
        ],
      },
    },
  },
})
