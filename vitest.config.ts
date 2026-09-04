import { defineConfig } from 'vitest/config'

import { providerInferenceProjects } from './packages/provider-inference/vitest.config'

export default defineConfig({
  test: {
    projects: [
      'server/apps/auth',
      'server/apps/api',
      'apps/ui-server-auth',
      'apps/stage-tamagotchi/vitest.node.config.ts',
      'packages/cap-vite',
      'packages/ccc',
      'packages/core-agent',
      'packages/i18n',
      'packages/input-gamepad',
      'packages/input-gamepad-vueuse',
      'packages/input-playstation-dualsense-5',
      'packages/model-driver-lipsync',
      'packages/better-ws',
      'packages/plugin-sdk',
      'packages/plugin-sdk-tamagotchi',
      ...providerInferenceProjects.map(project => ({ ...project, root: 'packages/provider-inference' })),
      'packages/scenarios-stage-tamagotchi-browser',
      'packages/scenarios-stage-tamagotchi-electron',
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
      'packages/vitest-plugin-fakemic',
    ],
  },
})
