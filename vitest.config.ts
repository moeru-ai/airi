import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // NOTICE: Keep this list sorted/grouped to reduce recurring merge conflicts
    // when packages are added from multiple feature branches.
    projects: [
      'apps/server',
      'apps/ui-server-auth',
      'apps/stage-tamagotchi',
      'packages/audio-pipelines-transcribe',
      'packages/cap-vite',
      'packages/core-agent',
      'packages/vishot-runner-browser',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/singing',
      'packages/stage-shared',
      'packages/stage-ui',
      'packages/vishot-runtime',
      'packages/vite-plugin-warpdrive',
    ],
  },
})
