import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Vue(),
    Unocss(),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
