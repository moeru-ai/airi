import { join } from 'node:path'
import { cwd } from 'node:process'

import Vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    plugins: [VueRouter({ routesFolder: [], dts: false }), Vue()],
    test: {
      env: loadEnv(mode, join(cwd(), 'apps', 'ui-server-auth'), ''),
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            include: ['src/**/*.test.ts'],
            exclude: ['src/**/*.browser.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['src/**/*.browser.test.ts'],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }
})
