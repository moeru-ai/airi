import type { WxtViteConfig } from 'wxt'

import UnoCSS from 'unocss/vite'

import { defineConfig } from 'wxt'

type VitePlugin = NonNullable<WxtViteConfig['plugins']>[number]

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Moeka Web Extension',
    description: 'Capture web context (videos, pages, subtitles) for Project Moeka.',
    permissions: ['storage', 'tabs'],
    optional_host_permissions: [
      '*://*/*',
    ],
    action: {
      default_title: 'Moeka Web Extension',
    },
  },
  vite: () => {
    return {
      plugins: [
        UnoCSS() as VitePlugin,
      ],
    }
  },
})
