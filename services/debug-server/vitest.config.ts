import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'debug-server',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
