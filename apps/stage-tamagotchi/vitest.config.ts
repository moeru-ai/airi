import { cwd } from 'node:process'

import vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'

import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // Resolve page-level <route> blocks without generating routes for unit tests.
    VueRouter({
      dts: false,
      routesFolder: [],
    }),
    vue(),
  ],
  test: {
    env: loadEnv('test', cwd(), ''),
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    fileParallelism: false,
    maxWorkers: 1,
  },
})
