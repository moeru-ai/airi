import starlight from '@astrojs/starlight'
import UnoCSS from 'unocss/astro'

import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://airi.build',
  vite: {
    // This kind of error occurs when building astro site:
    // The requested module 'nanoid/non-secure' does not provide an export named 'default'
    // 12:51:31 AM:   Location:
    // 12:51:31 AM:     /opt/build/repo/node_modules/.pnpm/astro@5.10.1_@types+node@24.0.4_encoding@0.1.13_jiti@2.4.2_less@4.3.0_lightningcss@1.30_07650979d98d2e2072de2da1f022c9b9/node_modules/astro/dist/core/build/pipeline.js:221:15
    //
    // Discovered these issues:
    //
    // [Build Error] The requested module 'x' does not provide an export named 'default' · Issue #8660 · withastro/astro
    // https://github.com/withastro/astro/issues/8660
    //
    // Related to:
    //
    // - Issue when importing default from module on SSR https://github.com/vitejs/vite/issues/10712
    // - CJS named imports in an ESM library https://github.com/vitejs/vite/issues/14332
    //
    // This is because somehow postcss related script is imported,
    // and import require$$0$2 from 'nanoid/non-secure' will be
    // generated, while nanoid/non-secure does not have a default export.
    ssr: {
      noExternal: ['nanoid'],
    },
  },
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
