#!/usr/bin/env node
/**
 * Version / artifact naming helper for stage-tamagotchi-kirie CI.
 * No electron-builder dependency — mirrors Electron nightly naming:
 *   nightly-YYYYMMDD-<sha7>  when no explicit tag is provided
 *   <tag without leading v>   when --tag is provided
 *
 * Usage:
 *   node scripts/artifacts-version.mjs --get-version [--tag v0.12.0]
 *   node scripts/artifacts-version.mjs --get-artifact-name --platform windows --arch x64 [--tag ...]
 *   node scripts/artifacts-version.mjs --get-artifact-name --platform macos --arch universal
 *   node scripts/artifacts-version.mjs --get-artifact-name --platform linux --arch x64|arm64
 *   node scripts/artifacts-version.mjs --get-artifact-name --platform android|ios
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appRoot = join(__dirname, '..')
const PRODUCT = 'AIRI-Kirie'

function parseArgs(argv) {
  const out = { tag: '', getVersion: false, getArtifactName: false, platform: '', arch: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--get-version')
      out.getVersion = true
    else if (a === '--get-artifact-name')
      out.getArtifactName = true
    else if (a === '--tag')
      out.tag = String(argv[++i] ?? '').trim()
    else if (a === '--platform')
      out.platform = String(argv[++i] ?? '').trim()
    else if (a === '--arch')
      out.arch = String(argv[++i] ?? '').trim()
  }
  return out
}

function shortSha() {
  try {
    return execSync('git log -1 --pretty=format:%H', { encoding: 'utf8' }).trim().slice(0, 7)
  }
  catch {
    return 'unknown'
  }
}

function packageVersion() {
  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'))
  return String(pkg.version || '0.0.0')
}

function resolveVersion(tag) {
  if (tag) {
    return tag.replace(/^v/, '').trim() || packageVersion()
  }
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `nightly-${date}-${shortSha()}`
}

function artifactName(version, platform, arch) {
  switch (platform) {
    case 'windows':
      return `${PRODUCT}-${version}-windows-${arch || 'x64'}`
    case 'macos':
      return `${PRODUCT}-${version}-macos-${arch || 'universal'}`
    case 'linux':
      return `${PRODUCT}-${version}-linux-${arch || 'x64'}`
    case 'android':
      return `${PRODUCT}-${version}-android`
    case 'ios':
      return `${PRODUCT}-${version}-ios`
    default:
      throw new Error(`Unknown platform: ${platform}`)
  }
}

const args = parseArgs(process.argv.slice(2))
const version = resolveVersion(args.tag)

if (args.getVersion) {
  console.info(version)
  process.exit(0)
}

if (args.getArtifactName) {
  if (!args.platform) {
    console.error('--platform is required with --get-artifact-name')
    process.exit(1)
  }
  console.info(artifactName(version, args.platform, args.arch))
  process.exit(0)
}

console.error('Specify --get-version or --get-artifact-name')
process.exit(1)
