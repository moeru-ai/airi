import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'server/apps/api',
      'apps/ui-server-auth',
      'apps/stage-tamagotchi',
      'packages/cap-vite',
      'packages/ccc',
      'packages/core-agent',
      'packages/i18n',
      'packages/better-ws',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      'packages/scenarios-stage-tamagotchi-browser',
      'packages/scenarios-stage-tamagotchi-electron',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
    ],
  },
})
