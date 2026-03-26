import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@proj-airi/server-sdk-shared': resolve(import.meta.dirname, '..', '..', 'packages', 'server-sdk-shared', 'src', 'index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: [
        'src/**/*.ts',
      ],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
})
