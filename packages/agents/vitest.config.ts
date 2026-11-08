import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/agents',
    include: ['src/**/*.test.ts'],
  },
})
