import Vue from '@vitejs/plugin-vue'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  // The row models import the time helpers of `@proj-airi/ui-timeline/headless`, whose index also exports components.
  plugins: [Vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
