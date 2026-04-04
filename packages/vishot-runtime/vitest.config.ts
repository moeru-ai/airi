import Vue from '@vitejs/plugin-vue'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [Vue()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
