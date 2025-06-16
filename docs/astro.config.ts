import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import UnoCSS from 'unocss/astro'

// https://astro.build/config
export default defineConfig({
  site: 'https://airi.build',
  integrations: [
    UnoCSS(),
    starlight({
      title: 'Project AIRI',
      logo: {
        light: './src/assets/logo.svg',
        dark: './src/assets/logo-dark.svg',
      },
      social: [
        {
          icon: 'seti:github',
          label: 'GitHub',
          href: 'https://github.com/moeru-ai/airi',
        },
      ],
      components: {
        Head: './src/components/starlight/Head.astro',
      },
      sidebar: [
        {
          label: 'Guides',
          autogenerate: { directory: 'guides' },
        },
        {
          label: 'References',
          autogenerate: { directory: 'references' },
        },
        {
          label: 'Blog',
          autogenerate: { directory: 'blog' },
        },
      ],
      head: [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'AIRI' } },
        { tag: 'link', attrs: { ref: 'manifest', href: '/site.webmanifest' } },
        { tag: 'script', attrs: { 'defer': true, 'data-domain': 'airi.moeru.ai', 'data-api': '/api/v1/page-external-data/submit', 'src': '/remote-assets/page-external-data/js/script.js' } },
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 6 },
      customCss: [
        './src/styles/custom.css',
        '@fontsource/quicksand/300.css',
        '@fontsource/fusion-pixel-12px-proportional-sc/400.css',
      ],
      // Set English as the default language for this site.
      defaultLocale: 'root',
      locales: {
        'root': {
          label: 'English',
          lang: 'en',
        },
        'zh-cn': {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
    }),
  ],
})
