import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core-terminal',
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
  },
})
