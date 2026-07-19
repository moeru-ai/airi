import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import DrizzleORMMigrations from '@proj-airi/unplugin-drizzle-orm-migrations/rolldown'

import { defineConfig } from 'tsdown'

// NOTICE:
// Resolve the server package root from this config file, not process.cwd().
// On Railway the rolldown plugin intermittently no-ops when `root` is a relative
// path (cwd can differ from packages/server-schema during tsdown). An absolute
// root keeps loadConfig + journal reads pointed at apps/server/drizzle.
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/server')

export default defineConfig({
  entry: [
    'src/index.ts',
  ],
  dts: true,
  sourcemap: true,
  unused: true,
  fixedExtension: true,
  plugins: [
    DrizzleORMMigrations({
      root: serverRoot,
    }),
  ],
})
