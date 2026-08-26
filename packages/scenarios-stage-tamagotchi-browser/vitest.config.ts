import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    Vue(),
    Unocss(),
  ],
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.test.ts'],
  },
})
