import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/stage-tamagotchi',
      'packages/audio-pipelines-transcribe',
      'packages/cap-vite',
      'packages/plugin-sdk',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
      'packages/stage-ui',
      'packages/vite-plugin-warpdrive',
    ],
  },
})
