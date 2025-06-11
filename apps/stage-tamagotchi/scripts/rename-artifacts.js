import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')
const tauriConfigJson = require('../src-tauri/tauri.conf.json')

const version = packageJson.version
const target = process.argv[2]
const productName = tauriConfigJson.productName
const dirname = import.meta.dirname

console.log('version: ', version)
console.log('target: ', target)

if (!target) {
  console.error('Target is required')
  process.exit(1)
}

const srcPrefix = path.join(dirname, '..', '..', '..', 'target', target, 'release', 'bundle')
const bundlePrefix = path.join(dirname, '..', '..', '..', 'bundle')

fs.mkdirSync(bundlePrefix, { recursive: true })

switch (target) {
  case 'x86_64-pc-windows-msvc':
    fs.renameSync(
      path.join(srcPrefix, 'nsis', `${productName}_${version}_x64-setup.exe`),
      path.join(bundlePrefix, `${productName}_${version}_windows_amd64-setup.exe`),
    )
    break
  case 'x86_64-unknown-linux-gnu':
    fs.renameSync(
      path.join(srcPrefix, 'appimage', `${productName}_${version}_amd64.AppImage`),
      path.join(bundlePrefix, `${productName}_${version}_linux_amd64.AppImage`),
    )
    break
  case 'aarch64-unknown-linux-gnu':
    fs.renameSync(
      path.join(srcPrefix, 'appimage', `${productName}_${version}_aarch64.AppImage`),
      path.join(bundlePrefix, `${productName}_${version}_linux_arm64.AppImage`),
    )
    break
  case 'aarch64-apple-darwin':
    fs.renameSync(
      path.join(srcPrefix, 'dmg', `${productName}_${version}_aarch64.dmg`),
      path.join(bundlePrefix, `${productName}_${version}_macos_arm64.dmg`),
    )
    break
  case 'x86_64-apple-darwin':
    fs.renameSync(
      path.join(srcPrefix, 'dmg', `${productName}_${version}_x64.dmg`),
      path.join(bundlePrefix, `${productName}_${version}_macos_amd64.dmg`),
    )
    break
  default:
    console.error('Target is not supported')
    process.exit(1)
}
