import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    retry: 1,
    coverage: {
      provider: 'v8',
      reporter: ['lcov'],
      reportOnFailure: true,
    },
    projects: [
      'apps/stage-tamagotchi',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
    ],
  },
})
