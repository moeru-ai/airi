import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['integrations/kwin-companion/tests/*.test.ts'],
    maxWorkers: 1,
  },
})
