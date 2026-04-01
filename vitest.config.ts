import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/probability-spinner',
      'apps/stage-tamagotchi',
      'packages/stage-ui',
      'packages/plugin-sdk',
      'packages/cap-vite',
      'packages/vite-plugin-warpdrive',
      'packages/audio-pipelines-transcribe',
      'packages/server-runtime',
      'apps/flick',
    ],
  },
})
