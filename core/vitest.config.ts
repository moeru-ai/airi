import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    root: path.resolve(__dirname, '..'),
  },
})
