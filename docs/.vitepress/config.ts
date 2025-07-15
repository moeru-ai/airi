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
  rekaDescription,
  rekaName,
  rekaShortName,
  releases,
} from './meta'

// function BadgeHTML(text: string, translucent = false) {
//   return `<div class="inline-flex items-center rounded-full border border-muted px-2 py-[1px] ml-2 text-[11px] transition-colors bg-primary/30 ${translucent ? '!bg-transparent' : ''} text-foreground">
// ${text}
// </div>
// `
// }

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
  title: rekaName,
  description: rekaDescription,
  titleTemplate: rekaShortName,
  head: [
    ['meta', { name: 'theme-color', content: '#00C38A' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: rekaName }],
    ['meta', { name: 'author', content: `${teamMembers.map(c => c.name).join(', ')} and ${rekaName} contributors` }],
    ['meta', { name: 'keywords', content: '' }],
    ['meta', { property: 'og:title', content: rekaName }],
    ['meta', { property: 'og:description', content: rekaDescription }],
    ['meta', { property: 'og:url', content: ogUrl }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { name: 'twitter:title', content: rekaName }],
    ['meta', { name: 'twitter:description', content: rekaDescription }],
    ['meta', { name: 'twitter:image', content: ogImage }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: '#ffffff' }],
  ],
  base: env.BASE_URL || '/',
  lastUpdated: true,
  sitemap: { hostname: ogUrl },
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
        ],
        outline: {
          level: 'deep',
        },
        logo: '/favicon.svg',

        sidebar: [
          {
            text: 'Overview',
            icon: 'lucide:rocket',
            items: [
              { text: 'Introduction', link: withBase('/en/docs/overview/') },
              { text: 'About AI VTuber', link: withBase('/en/docs/overview/about-ai-vtuber') },
              { text: 'About Neuro-sama', link: withBase('/en/docs/overview/about-neuro-sama') },
            ],
          },
          {
            text: 'Guides',
            icon: 'lucide:book-open',
            items: [
              { text: 'Contributing', link: withBase('/en/docs/guides/contributing/') },
              {
                text: 'Design Guidelines',
                link: withBase('/en/docs/guides/design-guidelines/'),
                items: [
                  { text: 'Resources', link: withBase('/en/docs/guides/contributing/design-guidelines/resources') },
                  { text: 'Tools', link: withBase('/en/docs/guides/contributing/design-guidelines/tools') },
                ],
              },
            ],
          },
          {
            text: 'Chronicles',
            icon: 'lucide:calendar-days',
            link: withBase('/en/docs/chronicles/'),
            items: [
              { text: 'Before Story v0.0.1', link: withBase('/en/docs/chronicles/version-v0.0.1/') },
              { text: 'Initial Publish v0.1.0', link: withBase('/en/docs/chronicles/version-v0.1.0/') },
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
        ],
        outline: {
          level: 'deep',
        },
        logo: '/favicon.svg',

        sidebar: [
          {
            text: '概览',
            icon: 'lucide:rocket',
            items: [
              { text: '介绍', link: withBase('/zh-Hans/docs/overview/') },
              { text: '有关 AI VTuber', link: withBase('/zh-Hans/docs/overview/about-ai-vtuber') },
              { text: '有关 Neuro-sama', link: withBase('/zh-Hans/docs/overview/about-neuro-sama') },
            ],
          },
          {
            text: '指南',
            icon: 'lucide:book-open',
            items: [
              { text: '贡献指南', link: withBase('/zh-Hans/docs/guides/contributing/') },
              {
                text: '设计指引',
                link: withBase('/zh-Hans/docs/guides/design-guidelines/'),
                items: [
                  { text: '参考资源', link: withBase('/zh-Hans/docs/guides/contributing/design-guidelines/resources') },
                  { text: '工具', link: withBase('/zh-Hans/docs/guides/contributing/design-guidelines/tools') },
                ],
              },
            ],
          },
          {
            text: '编年史',
            icon: 'lucide:calendar-days',
            link: withBase('/zh-Hans/docs/chronicles/'),
            items: [
              { text: '先前的故事 v0.0.1', link: withBase('/zh-Hans/docs/chronicles/version-v0.0.1/') },
              { text: '首次公开 v0.1.0', link: withBase('/zh-Hans/docs/chronicles/version-v0.1.0/') },
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
  },
  themeConfig: {
    socialLinks: [
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
          const title = state.tokens[idx + 1].content
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
        '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
      },
    },
    plugins: [
      // Thanks https://github.com/intlify/vue-i18n/issues/1205#issuecomment-2707075660
      i18n({ runtimeOnly: true, compositionOnly: true, fullInstall: true, ssr: true }),
      unocss(),
      yaml(),
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
