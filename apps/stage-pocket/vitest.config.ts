import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  server: { watch: null },
  test: {
    environment: 'jsdom',
    include: ['src/modules/**/*.test.ts', 'src/components/permissions/**/*.test.ts'],
  },
})
