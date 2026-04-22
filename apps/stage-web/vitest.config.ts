import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.browser.{spec,test}.ts', '**/node_modules/**', '**/.git/**'],
  },
})
