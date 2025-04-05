import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

const version = packageJson.version
const target = process.argv[2]
const dirname = import.meta.dirname

console.log('version: ', version)
console.log('target: ', target)

if (!target) {
  console.error('Target is required')
  process.exit(1)
}

const srcPrefix = path.join(dirname, '..', 'src-tauri', 'target', target, 'release', 'bundle')
const bundlePrefix = path.join(dirname, '..', 'bundle')

fs.mkdirSync(bundlePrefix)

switch (target) {
  case 'x86_64-pc-windows-msvc':
    fs.renameSync(
      path.join(srcPrefix, 'nsis', `airi_${version}_x64-setup.exe`),
      path.join(bundlePrefix, `airi_${version}_windows_amd64-setup.exe`),
    )
    break
  case 'x86_64-unknown-linux-gnu':
    fs.renameSync(
      path.join(srcPrefix, 'appimage', `airi_${version}_amd64.AppImage`),
      path.join(bundlePrefix, `airi_${version}_linux_amd64.AppImage`),
    )
    break
  case 'aarch64-unknown-linux-gnu':
    fs.renameSync(
      path.join(srcPrefix, 'appimage', `airi_${version}_aarch64.AppImage`),
      path.join(bundlePrefix, `airi_${version}_linux_arm64.AppImage`),
    )
    break
  case 'aarch64-apple-darwin':
    fs.renameSync(
      path.join(srcPrefix, 'dmg', `airi_${version}_aarch64.dmg`),
      path.join(bundlePrefix, `airi_${version}_macos_arm64.dmg`),
    )
    break
  case 'x86_64-apple-darwin':
    fs.renameSync(
      path.join(srcPrefix, 'dmg', `airi_${version}_x64.dmg`),
      path.join(bundlePrefix, `airi_${version}_macos_amd64.dmg`),
    )
    break
  default:
    console.error('Target is not supported')
    process.exit(1)
}
