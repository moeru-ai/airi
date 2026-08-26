import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      include: [
        'src/**/*.ts',
      ],
      provider: 'v8',
      reporter: [
        'text',
        'json',
        'html',
      ],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    environment: 'node',
    fileParallelism: false,
    globals: true,
    hookTimeout: 60_000,
    maxWorkers: 1,
  },
})
