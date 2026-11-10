import Info from 'unplugin-info/vite'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Stage UI stores reach build metadata through `~build/*` virtual modules.
  plugins: [Info()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
