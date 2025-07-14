import type { DefaultTheme } from 'vitepress'

import anchor from 'markdown-it-anchor'
import unocss from 'unocss/vite'

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
  lastUpdated: true,
  sitemap: { hostname: ogUrl },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Docs', link: '/docs/overview/getting-started' },
      { text: 'Blog', link: '/blog/' },
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
          { text: 'Introduction', link: '/docs/overview/' },
        ],
      },
      {
        text: 'Guides',
        icon: 'lucide:book-open',
        items: [
          { text: 'Styling', link: '/docs/guides/styling' },
        ],
      },
      {
        text: 'References',
        icon: 'lucide:wrench',
        items: [
          {
            text: 'Component',
            items: [
              { text: 'Config Provider', link: '/docs/utilities/config-provider' },
              { text: 'Focus Scope', link: '/docs/utilities/focus-scope' },
              { text: 'Presence', link: '/docs/utilities/presence' },
              { text: 'Primitive', link: '/docs/utilities/primitive' },
              { text: 'Roving Focus', link: '/docs/utilities/roving-focus' },
              { text: 'Slot', link: '/docs/utilities/slot' },
              { text: 'Visually Hidden', link: '/docs/utilities/visually-hidden' },
            ],
          },
        ],
      },
      {
        text: 'Examples',
        icon: 'lucide:square-dashed-mouse-pointer',
        link: '/examples/checkbox-group',
        items: [
          {
            text: 'Checkbox',
            items: [
              { text: 'Checkbox Group', link: '/examples/checkbox-group' },
            ],
          },
        ],
      },
    ] as (DefaultTheme.SidebarItem & { icon?: string })[],

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
    theme: 'catppuccin-mocha',
    headers: {
      level: [2, 3, 4, 5, 6],
    },
    anchor: {
      callback(token) {
        // set tw `group` modifier to heading element
        token.attrSet(
          'class',
          'group relative border-none mb-4 lg:-ml-2 lg:pl-2 lg:pr-2 w-max',
        )
      },
      permalink: anchor.permalink.linkInsideHeader({
        class:
          'header-anchor [&_span]:focus:opacity-100 [&_span_>_span]:focus:outline',
        symbol: `<span class="absolute top-0 -ml-8 hidden items-center border-0 opacity-0 group-hover:opacity-100 focus:opacity-100 lg:flex">&ZeroWidthSpace;<span class="flex h-6 w-6 items-center justify-center rounded-md outline-2 outline-primary text-green-400 shadow-sm  hover:text-green-700 hover:shadow dark:bg-primary/20 dark:text-primary/80 dark:shadow-none  dark:hover:bg-primary/40 dark:hover:text-primary"><svg width="12" height="12" fill="none" aria-hidden="true"><path d="M3.75 1v10M8.25 1v10M1 3.75h10M1 8.25h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg></span></span>`,
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
    plugins: [
      unocss(),
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
