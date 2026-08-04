import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [Cubism2Core()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
