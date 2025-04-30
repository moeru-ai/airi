import { join, resolve } from 'node:path'
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
  resolve: {
    alias: {
      '@proj-airi/ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'ui', 'src')),
    },
  },
  plugins: [
    vue(),
    Unocss(),
    Inspect(),
  ],
})
