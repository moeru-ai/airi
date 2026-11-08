import { join } from 'node:path'
import { env } from 'node:process'

import fakemic, { electron, web } from '@proj-airi/vitest-plugin-fakemic'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      fakemic({
        name: 'audio-web',
        include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.web.test.ts'],
        runtime: web({
          name: 'web',
          prepare: new URL('./src/runtimes/prepare-web.ts', import.meta.url).href,
          url: 'http://127.0.0.1:4173/',
          context: { permissions: ['microphone'] },
          preview: {
            configFile: join(import.meta.dirname, '../../apps/stage-web/vite.config.ts'),
            root: join(import.meta.dirname, '../../apps/stage-web'),
          },
        }),
      }),
      fakemic({
        name: 'audio-electron',
        include: ['cases/**/*.audio.test.ts', 'cases/**/*.audio.electron.test.ts'],
        runtime: electron({
          name: 'electron',
          prepare: new URL('./src/runtimes/prepare-electron.ts', import.meta.url).href,
          // The app directory, as an install starts it: `main` of its package.json is the ergosphere-it launcher,
          // which starts the bundle in `out/bundle`.
          entry: join(import.meta.dirname, '../../apps/stage-tamagotchi'),
          args: ['--no-sandbox'],
          cwd: join(import.meta.dirname, '../..'),
          // Cases run in the background, so the app must not take focus from the user.
          // To test focus behavior, set APP_IGNORE_FOCUS=0 in the shell.
          env: { APP_IGNORE_FOCUS: env.APP_IGNORE_FOCUS ?? '1' },
          temporaryUserData: {
            env: 'APP_USER_DATA_PATH',
            prefix: 'airi-testing-audio-',
          },
        }),
      }),
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
})
