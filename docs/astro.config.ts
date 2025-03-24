import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

// https://astro.build/config
export default defineConfig({
  site: 'https://airi.build',
  integrations: [
    starlight({
      title: 'Project Airi',
      logo: {
        light: './src/assets/logo.svg',
        dark: './src/assets/logo-dark.svg',
      },
      social: {
        github: 'https://github.com/moeru-ai/airi',
      },
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
        { tag: 'link', attrs: { rel: 'shortcut icon', href: '/favicon.ico' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Airi' } },
        { tag: 'link', attrs: { ref: 'manifest', href: '/site.webmanifest' } },
      ],
      customCss: [
        './src/styles/custom.css',
        '@fontsource/quicksand/300.css',
      ],
    }),
  ],
})
