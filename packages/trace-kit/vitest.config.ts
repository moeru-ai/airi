import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The reader benchmark runs a full garbage collection before each heap read.
    execArgv: ['--expose-gc'],
    include: ['src/**/*.test.ts'],
  },
})
