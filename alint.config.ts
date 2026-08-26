import jsPlugin from '@alint-js/plugin-js'

import { defineConfig } from '@alint-js/cli'

export default defineConfig([
  {
    extends: ['js/recommended'],
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    plugins: {
      js: jsPlugin,
    },
    ignores: ['**/node_modules/**'],
  },
])
