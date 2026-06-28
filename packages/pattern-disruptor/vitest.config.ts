import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/pattern-disruptor',
    include: ['src/**/*.test.ts'],
  },
})
