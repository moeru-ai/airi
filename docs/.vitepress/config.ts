import autoprefixer from 'autoprefixer'
import anchor from 'markdown-it-anchor'
import unocss from 'unocss/vite'
import { defineConfig, postcssIsolateStyles } from 'vitepress'

import { version } from '../../package.json'
import { teamMembers } from './contributors'
import {
  discord,
  font,
  github,
  legacyLink,
  legacyVersion,
  ogImage,
  ogUrl,
  rekaDescription,
  rekaName,
  rekaShortName,
  releases,
} from './meta'
import ComponentPreviewPlugin from './plugins/ComponentPreview'
import { createHoverTransformer } from './plugins/HoverTransformer'
import InstallationTabsPlugin from './plugins/InstallationTabs'

function BadgeHTML(text: string, translucent = false) {
  return `<div class="inline-flex items-center rounded-full border border-muted px-2 py-[1px] ml-2 text-[11px] transition-colors bg-primary/30 ${translucent ? '!bg-transparent' : ''} text-foreground">
${text}
</div>
`
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  cleanUrls: true,
  title: rekaName,
  description: rekaDescription,
  titleTemplate: rekaShortName,
  head: [
    ['meta', { name: 'theme-color', content: '#00C38A' }],
    ['link', { rel: 'icon', href: '/logo.png' }],
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'author', content: `${teamMembers.map(c => c.name).join(', ')} and ${rekaName} contributors` }],
    ['meta', { name: 'keywords', content: 'vue, nuxt, component-library, radix, radix-vue, reka-ui, typescript' }],
    ['meta', { property: 'og:title', content: rekaName }],
    ['meta', { property: 'og:description', content: rekaDescription }],
    ['meta', { property: 'og:url', content: ogUrl }],
    ['meta', { property: 'og:image', content: ogImage }],
    ['meta', { name: 'twitter:title', content: rekaName }],
    ['meta', { name: 'twitter:description', content: rekaDescription }],
    ['meta', { name: 'twitter:image', content: ogImage }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'link',
      {
        rel: 'preload',
        as: 'style',
        onload: 'this.onload=null;this.rel=\'stylesheet\'',
        href: font,
      },
    ],
    [
      'noscript',
      {},
      `<link rel="stylesheet" crossorigin="anonymous" href="${font}" />`,
    ],
    ['link', { rel: 'mask-icon', href: '/logo.svg', color: '#ffffff' }],
    [
      'link',
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
    ],
  ],
  lastUpdated: true,
  sitemap: { hostname: ogUrl },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Docs', link: '/docs/overview/getting-started' },
      { text: 'Examples', link: '/examples/checkbox-group' },
      { text: 'Showcase', link: '/showcase' },
      {
        text: `v${version}`,
        items: [
          { text: 'Release Notes ', link: releases },
          { text: legacyVersion, link: legacyLink },
        ],
      },
    ],
    outline: {
      level: [2, 3],
    },
    logo: '/logo.svg',

    sidebar: [
      {
        text: 'Overview',
        icon: 'lucide:rocket',
        items: [
          { text: 'Introduction', link: '/docs/overview/introduction' },
          { text: 'Getting Started', link: '/docs/overview/getting-started' },
          { text: 'Installation', link: '/docs/overview/installation' },
          { text: 'Accessibility', link: '/docs/overview/accessibility' },
          { text: 'Releases', link: '/docs/overview/releases' },
        ],
      },
      {
        text: 'Guides',
        icon: 'lucide:book-open',
        items: [
          { text: 'Styling', link: '/docs/guides/styling' },
          { text: 'Animation/Transition', link: '/docs/guides/animation' },
          { text: 'Composition', link: '/docs/guides/composition' },
          { text: `Controlled State ${BadgeHTML('New')}`, link: '/docs/guides/controlled-state' },
          {
            text: 'Server side rendering',
            link: '/docs/guides/server-side-rendering',
          },
          { text: 'Namespaced', link: '/docs/guides/namespaced-components' },
          { text: 'Dates', link: '/docs/guides/dates' },
          { text: 'Internationalization (RTL)', link: '/docs/guides/i18n' },
          {
            text: `Inject Context ${BadgeHTML('New')}`,
            link: '/docs/guides/inject-context',
          },
          {
            text: `Virtualization ${BadgeHTML('New')}`,
            link: '/docs/guides/virtualization',
          },
          {
            text: `Migration ${BadgeHTML('New')}`,
            link: '/docs/guides/migration',
          },
        ],
      },
      {
        text: 'Components',
        icon: 'lucide:box',
        items: [
          {
            text: 'Form',
            items: [
              { text: 'Checkbox', link: '/docs/components/checkbox' },
              { text: 'Combobox', link: '/docs/components/combobox' },
              { text: `Editable`, link: '/docs/components/editable' },
              { text: `Listbox`, link: '/docs/components/listbox' },
              { text: `Number Field`, link: '/docs/components/number-field' },
              { text: 'Label', link: '/docs/components/label' },
              { text: 'Pin Input', link: '/docs/components/pin-input' },
              { text: 'Radio Group', link: '/docs/components/radio-group' },
              { text: 'Select', link: '/docs/components/select' },
              { text: 'Slider', link: '/docs/components/slider' },
              { text: 'Switch', link: '/docs/components/switch' },
              { text: 'Tags Input', link: '/docs/components/tags-input' },
              { text: 'Toggle', link: '/docs/components/toggle' },
              { text: 'Toggle Group', link: '/docs/components/toggle-group' },
            ],
          },
          {
            text: 'Dates',
            items: [
              {
                text: `Calendar ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/calendar',
              },
              {
                text: `Date Field ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/date-field',
              },
              {
                text: `Date Picker ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/date-picker',
              },
              {
                text: `Date Range Field ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/date-range-field',
              },
              {
                text: `Date Range Picker ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/date-range-picker',
              },
              {
                text: `Range Calendar ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/range-calendar',
              },
              {
                text: `Time Field ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/time-field',
              },
            ],
          },
          {
            text: 'General',
            items: [
              { text: 'Accordion', link: '/docs/components/accordion' },
              { text: 'Alert Dialog', link: '/docs/components/alert-dialog' },
              { text: 'Aspect Ratio', link: '/docs/components/aspect-ratio' },
              { text: 'Avatar', link: '/docs/components/avatar' },
              { text: 'Collapsible', link: '/docs/components/collapsible' },
              { text: 'Context Menu', link: '/docs/components/context-menu' },
              { text: 'Dialog', link: '/docs/components/dialog' },
              { text: 'Dropdown Menu', link: '/docs/components/dropdown-menu' },
              { text: 'Hover Card', link: '/docs/components/hover-card' },
              { text: 'Menubar', link: '/docs/components/menubar' },
              {
                text: 'Navigation Menu',
                link: '/docs/components/navigation-menu',
              },
              { text: 'Pagination', link: '/docs/components/pagination' },
              { text: 'Popover', link: '/docs/components/popover' },
              { text: 'Progress', link: '/docs/components/progress' },
              { text: 'Scroll Area', link: '/docs/components/scroll-area' },
              { text: 'Separator', link: '/docs/components/separator' },
              { text: 'Splitter', link: '/docs/components/splitter' },
              {
                text: `Stepper ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/stepper',
              },
              { text: 'Tabs', link: '/docs/components/tabs' },
              { text: 'Toast', link: '/docs/components/toast' },
              { text: 'Toolbar', link: '/docs/components/toolbar' },
              { text: 'Tooltip', link: '/docs/components/tooltip' },
              {
                text: `Tree ${BadgeHTML('Alpha', true)}`,
                link: '/docs/components/tree',
              },
            ],
          },
        ],
      },
      {
        text: 'Utilities',
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
          {
            text: 'Composable',
            items: [
              { text: 'useId', link: '/docs/utilities/use-id' },
              {
                text: 'useDateFormatter',
                link: '/docs/utilities/use-date-formatter',
              },
              {
                text: 'useEmitAsProps',
                link: '/docs/utilities/use-emit-as-props',
              },
              { text: 'useFilter', link: '/docs/utilities/use-filter' },
              {
                text: 'useForwardExpose',
                link: '/docs/utilities/use-forward-expose',
              },
              {
                text: 'useForwardProps',
                link: '/docs/utilities/use-forward-props',
              },
              {
                text: 'useForwardPropsEmits',
                link: '/docs/utilities/use-forward-props-emits',
              },
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
          {
            text: 'Combobox',
            items: [
              {
                text: 'Combobox Tags Input',
                link: '/examples/combobox-tags-input',
              },
              {
                text: 'Combobox Textarea',
                link: '/examples/combobox-textarea',
              },
            ],
          },
          {
            text: 'Date',
            items: [
              {
                text: 'Date Picker Selection',
                link: '/examples/date-picker-selection',
              },
            ],
          },
          {
            text: 'Dialog',
            items: [
              { text: 'Dialog Command Menu', link: '/examples/dialog-command-menu' },
              { text: 'Dialog Gesture Driven', link: '/examples/dialog-gesture-driven' },
            ],
          },
          {
            text: 'Listbox',
            items: [
              { text: 'Listbox Transfer', link: '/examples/listbox-transfer' },
            ],
          },
          {
            text: 'Slider',
            items: [
              {
                text: 'Slider with Number Field',
                link: '/examples/slider-number-field',
              },
              { text: 'Slider Tooltip', link: '/examples/slider-tooltip' },
            ],
          },
          {
            text: 'Tooltip',
            items: [
              { text: 'Tooltip Cursor', link: '/examples/tooltip-cursor' },
            ],
          },
          {
            text: 'Progress',
            items: [
              {
                text: 'Circular Progress',
                link: '/examples/progress-circular',
              },
            ],
          },
        ],
      },
    ],

    socialLinks: [
      { icon: 'discord', link: discord },
      { icon: 'github', link: github },
    ],

    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/unovue/reka-ui/edit/v2/docs/content/:path',
    },
    carbonAds: {
      code: 'CW7DP2JW',
      placement: 'reka-uicom',
    },
  },
  srcDir: 'content',
  appearance: 'dark',
  markdown: {
    theme: 'github-dark',
    headers: {
      level: [2, 3],
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

    preConfig(md) {
      md.use(ComponentPreviewPlugin)
      md.use(InstallationTabsPlugin)
    },
    codeTransformers: [createHoverTransformer()],
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
          autoprefixer(),
          postcssIsolateStyles({ includeFiles: [/vp-doc\.css/] }),
        ],
      },
    },
  },
})
