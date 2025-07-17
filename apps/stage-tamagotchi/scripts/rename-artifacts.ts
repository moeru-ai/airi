import process from 'node:process'

import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { cac } from 'cac'
import { execa } from 'execa'

import packageJSON from '../package.json' assert { type: 'json' }
import tauriConfigJSON from '../src-tauri/tauri.conf.json' assert { type: 'json' }

const cli = cac('rename-artifact')
  .option(
    '--release',
    'Rename with version from package.json',
    { default: false },
  )
  .option(
    '--auto-tag',
    'Automatically tag the release with the latest git ref',
    { default: false },
  )
  .option(
    '--tag <tag>',
    'Tag to use for the release',
    { default: '', type: [String] },
  )

const args = cli.parse()

let version = packageJSON.version
const target = args.args[0]
const productName = tauriConfigJSON.productName
const dirname = import.meta.dirname

const beforeVersion = version
const beforeProductName = productName

const argOptions = args.options as {
  release: boolean
  autoTag: boolean
  tag: string[]
}

if (argOptions.release) {
  // If --release is specified, use the version from package.json
  version = packageJSON.version

  if (argOptions.tag) {
    if (argOptions.tag[0] !== 'true') {
      // If --tag is specified, use the provided tag
      version = String(argOptions.tag[0]).replace(/^v/, '').trim()
    }
    else {
      version = ''
    }

    if (!version) {
      if (argOptions.autoTag) {
      // If --auto-tag is specified, fetch the latest git ref
        const res = await execa('git', ['describe', '--tags', '--abbrev=0'])
        version = String(res.stdout).replace(/^v/, '').trim()
      }
      else {
        throw new Error('Tag cannot be empty when --release is specified')
      }
    }
  }
}
else {
  // Otherwise, fetch from the latest git ref
  const res = await execa('git', ['log', '-1', '--pretty=format:"%H"'])
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
  version = `nightly-${date}-${String(res.stdout.replace(/"/g, '')).trim().substring(0, 7)}`
}

console.log('version:', beforeVersion, version)
console.log('target:', target)
console.log('productName:', beforeProductName, productName)
console.log('dirname:', dirname)

if (!target) {
  throw new Error('<Target> is required')
}

const srcPrefix = join(dirname, '..', '..', '..', 'target', target, 'release', 'bundle')
const bundlePrefix = join(dirname, '..', '..', '..', 'bundle')

console.log('srcPrefix:', srcPrefix)
console.log('bundlePrefix:', bundlePrefix)
console.log(readdirSync(srcPrefix))

mkdirSync(bundlePrefix, { recursive: true })

switch (target) {
  case 'x86_64-pc-windows-msvc':
    renameSync(
      join(srcPrefix, 'nsis', `${beforeProductName}_${beforeVersion}_x64-setup.exe`),
      join(bundlePrefix, `${productName}_${version}_windows_amd64-setup.exe`),
    )
    break
  case 'x86_64-unknown-linux-gnu':
    renameSync(
      join(srcPrefix, 'appimage', `${beforeProductName}_${beforeVersion}_amd64.AppImage`),
      join(bundlePrefix, `${productName}_${version}_linux_amd64.AppImage`),
    )
    break
  case 'aarch64-unknown-linux-gnu':
    renameSync(
      join(srcPrefix, 'appimage', `${beforeProductName}_${beforeVersion}_aarch64.AppImage`),
      join(bundlePrefix, `${productName}_${version}_linux_arm64.AppImage`),
    )
    break
  case 'aarch64-apple-darwin':
    renameSync(
      join(srcPrefix, 'dmg', `${beforeProductName}_${beforeVersion}_aarch64.dmg`),
      join(bundlePrefix, `${productName}_${version}_macos_arm64.dmg`),
    )
    break
  case 'x86_64-apple-darwin':
    renameSync(
      join(srcPrefix, 'dmg', `${beforeProductName}_${beforeVersion}_x64.dmg`),
      join(bundlePrefix, `${productName}_${version}_macos_amd64.dmg`),
    )
    break
  default:
    console.error('Target is not supported')
    process.exit(1)
}
