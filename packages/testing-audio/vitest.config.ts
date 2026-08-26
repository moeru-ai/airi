import { join } from 'node:path'

import fakemic, { electron, web } from '@proj-airi/vitest-plugin-fakemic'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      fakemic({
        include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.web.test.ts'],
        name: 'audio-web',
        runtime: web({
          context: { permissions: ['microphone'] },
          name: 'web',
          prepare: new URL('./src/runtimes/prepare-web.ts', import.meta.url).href,
          preview: {
            configFile: join(import.meta.dirname, '../../apps/stage-web/vite.config.ts'),
            root: join(import.meta.dirname, '../../apps/stage-web'),
          },
          url: 'http://127.0.0.1:4173/',
        }),
      }),
      fakemic({
        include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.electron.test.ts'],
        name: 'audio-electron',
        runtime: electron({
          args: ['--no-sandbox'],
          cwd: join(import.meta.dirname, '../..'),
          entry: join(import.meta.dirname, '../../apps/stage-tamagotchi/out/main/index.js'),
          name: 'electron',
          prepare: new URL('./src/runtimes/prepare-electron.ts', import.meta.url).href,
          temporaryUserData: {
            env: 'APP_USER_DATA_PATH',
            prefix: 'airi-testing-audio-',
          },
        }),
      }),
      {
        extends: true,
        test: {
          include: ['src/**/*.test.ts'],
          name: 'unit',
        },
      },
    ],
  },
})
