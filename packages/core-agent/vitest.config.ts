import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/core-agent',
    include: ['src/**/*.test.ts'],
  },
})
