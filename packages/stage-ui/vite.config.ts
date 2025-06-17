import { join } from 'node:path'

import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'

// For Histoire
export default defineConfig({
  server: {
    fs: {
      allow: [join('..', '..')],
    },
  },
  plugins: [
    vue(),
    Unocss(),
    Inspect(),
  ],
})
