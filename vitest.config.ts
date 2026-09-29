import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { providerInferenceProjects } from './packages/provider-inference/vitest.config'

export default defineConfig({
  test: {
    projects: [
      'services/debug-server',
      {
        test: {
          name: 'io-tracer-browser',
          include: ['packages/stage-ui/src/composables/use-io-tracer.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
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
      'packages/stage-ui-live2d/vitest.node.config.ts',
      'packages/stage-ui-three',
      'packages/vitest-plugin-fakemic',
      'packages/vite-plugin-sherpaw',
      // Scripts that GitHub Actions run. They belong to no package.
      {
        test: {
          name: 'github-scripts',
          include: ['.github/scripts/**/*.test.ts'],
        },
      },
    ],
  },
})
