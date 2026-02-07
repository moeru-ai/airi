import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'packages/stage-ui',
      'packages/plugin-sdk',
      'packages/vite-plugin-warpdrive',
      'packages/audio-pipelines-transcribe',
      'packages/server-runtime',
    ],
  },
})
