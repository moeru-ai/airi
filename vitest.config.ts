import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // NOTICE: Keep this list sorted/grouped to reduce recurring merge conflicts
    // when packages are added from multiple feature branches.
    projects: [
      'apps/server',
      'apps/stage-tamagotchi',
      'packages/audio-pipelines-transcribe',
      'packages/cap-vite',
      'packages/plugin-sdk',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/singing',
      'packages/stage-ui',
      'packages/vite-plugin-warpdrive',
    ],
  },
})
