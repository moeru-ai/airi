import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') {
  console.info('Skipping Apple Speech native build outside macOS.')
  process.exit(0)
}

execFileSync(fileURLToPath(new URL('./build.sh', import.meta.url)), {
  stdio: 'inherit',
})
