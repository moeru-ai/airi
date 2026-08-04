import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globals: true,
    hookTimeout: 60_000,
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
      ],
      reporter: [
        'text',
        'json',
        'html',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
