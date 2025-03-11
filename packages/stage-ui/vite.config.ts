import vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import { defineConfig } from 'vite'

// For Histoire
export default defineConfig({
  plugins: [
    vue(),
    Unocss(),
  ],
})
