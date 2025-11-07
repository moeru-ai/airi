import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/injecta',
      'packages/stage-ui',
    ],
  },
})
