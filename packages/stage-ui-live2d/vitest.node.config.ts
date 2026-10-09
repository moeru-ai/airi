import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { defineProject } from 'vitest/config'

export default defineProject({
  root: import.meta.dirname,
  // The root test run reaches this package through this project, and
  // `live2d-runtime` imports `virtual:live2d-sdk/cores` at module scope. Without
  // sources the plugin answers with an unavailable capability, which is the state
  // the runtime-selection tests exercise.
  plugins: [Cubism2Core()],
  test: {
    name: 'stage-ui-live2d:node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.browser.test.ts', '**/node_modules/**', '**/.git/**'],
  },
})
