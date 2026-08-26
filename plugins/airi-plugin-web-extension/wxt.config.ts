import type { WxtViteConfig } from 'wxt'

import UnoCSS from 'unocss/vite'

import { defineConfig } from 'wxt'

type VitePlugin = NonNullable<WxtViteConfig['plugins']>[number]

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    action: {
      default_title: 'AIRI Web Extension',
    },
    description: 'Capture web context (videos, pages, subtitles) for Project AIRI.',
    name: 'AIRI Web Extension',
    optional_host_permissions: [
      '*://*/*',
    ],
    permissions: ['storage', 'tabs'],
  },
  modules: ['@wxt-dev/module-vue'],
  vite: () => {
    return {
      plugins: [
        UnoCSS() as VitePlugin,
      ],
    }
  },
})
