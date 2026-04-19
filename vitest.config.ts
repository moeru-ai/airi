import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'apps/server',
      'apps/ui-server-auth',
      'apps/stage-web',
      'apps/ui-server-auth',
      'apps/stage-tamagotchi',
      'packages/audio-pipelines-transcribe',
      'packages/cap-vite',
      'packages/vishot-runner-browser',
      'packages/plugin-sdk',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
      'packages/stage-ui',
      'packages/vishot-runtime',
      'packages/vite-plugin-warpdrive',
    ],
  },
})
