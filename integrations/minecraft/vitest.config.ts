import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['src/agents/action/*.test.ts'],
    include: ['src/**/*.test.ts'],
  },
})
