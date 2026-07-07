import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/ui-server-auth',
      'apps/stage-tamagotchi',
      'packages/cap-vite',
      'packages/core-agent',
      'packages/vishot-runner-browser',
      'packages/better-ws',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
    ],
  },
})
