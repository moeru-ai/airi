import process from 'node:process'

import { fileURLToPath } from 'node:url'

import * as fs from 'node:fs'
import * as path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { arch, platform } = process
const tauriTriple = process.env.TAURI_ENV_TARGET_TRIPLE

if (!tauriTriple) {
  console.error('TAURI_ENV_TARGET_TRIPLE environment variable is not set.')
  process.exit(1)
}

let pkgArch: string
if (arch === 'x64' || arch === 'amd64' || arch === 'ia32') {
  pkgArch = 'x64'
}
else if (arch === 'arm64' || arch === 'aarch64') {
  pkgArch = 'arm64'
}
else {
  console.error(`Unsupported architecture: ${arch}`)
  process.exit(1)
}

let pkgName: string
if (platform === 'win32') {
  pkgName = `memory-service-bin-win-${pkgArch}.exe`
}
else if (platform === 'darwin') {
  pkgName = `memory-service-bin-macos-${pkgArch}`
}
else {
  pkgName = `memory-service-bin-linux-${pkgArch}`
}

const source = path.join(__dirname, '..', '..', '..', 'services', 'memory-service', 'dist', pkgName)
const target = path.join(__dirname, '..', '..', '..', 'services', 'memory-service', 'dist', `memory-service-bin-${tauriTriple}`)

console.log(`Creating symlink from: ${source}`)
console.log(`To: ${target}`)

// Check if symlink already exists and remove it
if (fs.existsSync(target)) {
  fs.unlinkSync(target)
  console.log('Unlinked existing symlink.')
}

try {
  // Create the new symlink
  fs.symlinkSync(source, target, platform === 'win32' ? 'junction' : null)
  console.log('Symlink created successfully.')
}
catch (e: unknown) {
  console.error(`Failed to create symlink: ${e}`)
  process.exit(1)
}
