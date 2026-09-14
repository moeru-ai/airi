import { defineConfig } from 'vitest/config'

import { providerInferenceProjects } from './packages/provider-inference/vitest.config'

export default defineConfig({
  test: {
    projects: [
      'packages/ccc',
      'packages/core-agent',
      'packages/i18n',
      'packages/input-gamepad',
      'packages/input-playstation-dualsense-5',
      'packages/model-driver-lipsync',
      'packages/better-ws',
      'packages/plugin-sdk',
      ...providerInferenceProjects.map(project => ({ ...project, root: 'packages/provider-inference' })),
      'packages/server-runtime',
      'packages/server-sdk',
      'packages/stage-shared',
      'packages/stage-ui-live2d',
      'packages/vitest-plugin-fakemic',
    ],
  },
})
