import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const electronDir = resolve(__dirname, '..', 'node_modules', 'electron')
const distDir = resolve(electronDir, 'dist')
const electronBin = resolve(distDir, 'electron')

if (existsSync(electronBin)) {
  process.exit(0)
}

// eslint-disable-next-line no-console
console.log('[ensure-electron] Electron binary not found, downloading...')

// Find @electron/get in the pnpm store (sibling of electron in .pnpm)
const pnpmStoreDir = resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
const electronStoreDir = join(pnpmStoreDir, 'electron@42.3.0', 'node_modules')
const electronGetDir = resolve(electronStoreDir, '@electron', 'get')

// eslint-disable-next-line no-undef-init -- Intentionally uninitialized, assigned in try block
let downloadArtifact
try {
  const require = createRequire(join(electronGetDir, 'package.json'))
  downloadArtifact = require('@electron/get').downloadArtifact
} catch {
  // Fallback: try resolving from the electron package's own install.js approach
  const require = createRequire(join(electronDir, 'package.json'))
  downloadArtifact = require('@electron/get').downloadArtifact
}

try {
  const zipPath = await downloadArtifact({
    version: '42.3.0',
    artifactName: 'electron',
    platform: 'linux',
    arch: 'x64',
  })
// eslint-disable-next-line no-console

  console.log('[ensure-electron] Downloaded to:', zipPath)
  mkdirSync(distDir, { recursive: true })
  execSync(`unzip -o "${zipPath}" -d "${distDir}"`, { stdio: 'inherit' })
  // eslint-disable-next-line no-console
  writeFileSync(resolve(electronDir, 'path.txt'), 'electron')
  console.log('[ensure-electron] Electron binary installed successfully')
} catch (err) {
  console.error('[ensure-electron] Failed to install electron binary:', err.message)
  process.exit(1)
}
