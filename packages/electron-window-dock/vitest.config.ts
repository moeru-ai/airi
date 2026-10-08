import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@proj-airi/electron-window-dock',
    include: ['src/**/*.test.ts'],
  },
})
