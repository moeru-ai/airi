import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/stage-ui',
      'packages/vite-plugin-warpdrive',
      'packages/audio-pipelines-transcribe',
    ],
  },
})
