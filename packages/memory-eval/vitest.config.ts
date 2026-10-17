import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/memory-eval',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
