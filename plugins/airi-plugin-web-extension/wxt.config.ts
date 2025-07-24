import type { WxtViteConfig } from 'wxt'

import UnoCSS from 'unocss/vite'

import { defineConfig } from 'wxt'

type VitePlugin = NonNullable<WxtViteConfig['plugins']>[number]

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => {
    return {
      plugins: [
        UnoCSS() as VitePlugin,
      ],
    }
  },
})
