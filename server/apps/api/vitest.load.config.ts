import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/services/domain/billing/tests/*.load.test.ts'],
    environment: 'node',
    silent: false,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 120_000,
  },
})
