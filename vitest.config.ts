import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'packages/stage-ui',
      'packages/vite-plugin-warpdrive',
    ],
  },
})
