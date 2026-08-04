import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['glossary/**/*.test.ts'],
  },
})
