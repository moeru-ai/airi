import process from 'node:process'

import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { cac } from 'cac'

import packageJSON from '../package.json' assert { type: 'json' }
import tauriConfigJSON from '../src-tauri/tauri.conf.json' assert { type: 'json' }

import { getFilename, getVersion } from './utils'

async function main() {
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

  version = await getVersion(argOptions)

  // Script configuration

  if (!target) {
    throw new Error('<Target> is required')
  }

  const srcPrefix = join(dirname, '..', '..', '..', 'target', target, 'release', 'bundle')
  const bundlePrefix = join(dirname, '..', '..', '..', 'bundle')

  // Setup directories

  mkdirSync(bundlePrefix, { recursive: true })

  let renameFrom = ''
  let renameTo = ''
  const filename = await getFilename(target, argOptions)

  switch (target) {
    case 'x86_64-pc-windows-msvc':
      renameFrom = join(srcPrefix, 'nsis', `${beforeProductName}_${beforeVersion}_x64-setup.exe`)
      renameTo = join(bundlePrefix, filename)
      break
    case 'x86_64-unknown-linux-gnu':
      renameFrom = join(srcPrefix, 'appimage', `${beforeProductName}_${beforeVersion}_amd64.AppImage`)
      renameTo = join(bundlePrefix, filename)
      break
    case 'aarch64-unknown-linux-gnu':
      renameFrom = join(srcPrefix, 'appimage', `${beforeProductName}_${beforeVersion}_aarch64.AppImage`)
      renameTo = join(bundlePrefix, filename)
      break
    case 'aarch64-apple-darwin':
      renameFrom = join(srcPrefix, 'dmg', `${beforeProductName}_${beforeVersion}_aarch64.dmg`)
      renameTo = join(bundlePrefix, filename)
      break
    case 'x86_64-apple-darwin':
      renameFrom = join(srcPrefix, 'dmg', `${beforeProductName}_${beforeVersion}_x64.dmg`)
      renameTo = join(bundlePrefix, filename)
      break
    default:
      process.exit(1)
  }

  // Perform rename operation
  renameSync(renameFrom, renameTo)
}

main()
  .then(() => {
    // Renaming completed
  })
  .catch(() => {
    process.exit(1)
  })
