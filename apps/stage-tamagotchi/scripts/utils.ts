import process from 'node:process'

import { execa } from 'execa'

import packageJSON from '../package.json' assert { type: 'json' }
import tauriConfigJSON from '../src-tauri/tauri.conf.json' assert { type: 'json' }

export async function getVersion(options: { release: boolean, autoTag: boolean, tag: string[] }) {
  if (!options.release || !options.tag) {
    // Otherwise, fetch from the latest git ref
    const res = await execa('git', ['log', '-1', '--pretty=format:"%H"'])
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')
    return `nightly-${date}-${String(res.stdout.replace(/"/g, '')).trim().substring(0, 7)}`
  }

  // If --release is specified, use the version from package.json
  let version = packageJSON.version

  // If --tag is specified, use the provided tag
  if (options.tag[0] !== 'true') {
    version = String(options.tag[0]).replace(/^v/, '').trim()
  }
  // Otherwise, even for --tag option (true / enabled), ignore the input
  else {
    version = ''
  }

  if (version) {
    return version
  }

  // If no version is provided and --auto-tag is not specified, throw an error
  if (!options.autoTag) {
    throw new Error('Tag cannot be empty when --release is specified')
  }

  // Now, only auto-tag & release && non-specific tag is the only possibility,
  // fetch the latest git ref
  try {
    const res = await execa('git', ['describe', '--tags', '--abbrev=0'])
    return String(res.stdout).replace(/^v/, '').trim()
  }
  catch {
    // If no tags exist, fall back to package.json version
    console.warn('No git tags found, falling back to package.json version')
    return packageJSON.version
  }
}

export async function getFilename(target: string, options: { release: boolean, autoTag: boolean, tag: string[] }) {
  const productName = tauriConfigJSON.productName
  const version = await getVersion(options)

  if (!target) {
    throw new Error('<Target> is required')
  }

  switch (target) {
    case 'x86_64-pc-windows-msvc':
      return `${productName}_${version}_windows_amd64-setup.exe`
      break
    case 'x86_64-unknown-linux-gnu':
      return `${productName}_${version}_linux_amd64.AppImage`
      break
    case 'aarch64-unknown-linux-gnu':
      return `${productName}_${version}_linux_arm64.AppImage`
      break
    case 'aarch64-apple-darwin':
      return `${productName}_${version}_macos_arm64.dmg`
      break
    case 'x86_64-apple-darwin':
      return `${productName}_${version}_macos_amd64.dmg`
    default:
      console.error('Target is not supported')
      process.exit(1)
  }
}
