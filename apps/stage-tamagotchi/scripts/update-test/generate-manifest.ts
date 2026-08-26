import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { exit } from 'node:process'

import { cac } from 'cac'

import * as yaml from 'yaml'

import { getFilenames } from '../utils'

export interface GenerateManifestFixturesOptions {
  artifactContent?: string
  channel: UpdateTestChannel
  releaseNotes: string
  rootDir: string
  target: string
  version: string
}

export interface GenerateManifestFixturesResult {
  artifactFilename: string
  artifactPath: string
  channelDir: string
  latestFilename: string
  manifestPath: string
}

export type UpdateTestChannel = 'alpha' | 'beta' | 'canary' | 'nightly' | 'stable'

export async function generateManifestFixtures(options: GenerateManifestFixturesOptions): Promise<GenerateManifestFixturesResult> {
  const channelDir = join(options.rootDir, options.channel)
  const latestFilename = resolveLatestFilenameForTarget(options.target)
  const artifactFilename = await resolveArtifactFilename(options.target, options.version)
  const manifestPath = join(channelDir, latestFilename)
  const artifactPath = join(channelDir, artifactFilename)
  const artifactContent = options.artifactContent ?? `mock-update-${options.channel}-${options.version}`

  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(artifactPath, artifactContent, 'utf8')

  const sha512 = encodeBase64Sha512(artifactContent)
  const releaseDate = new Date().toISOString()
  const size = Buffer.byteLength(artifactContent)

  const manifest = {
    files: [
      {
        sha512,
        size,
        url: artifactFilename,
      },
    ],
    path: artifactFilename,
    releaseDate,
    releaseNotes: options.releaseNotes,
    sha512,
    version: options.version,
  }

  await writeFile(manifestPath, yaml.stringify(manifest), 'utf8')

  return {
    artifactFilename,
    artifactPath,
    channelDir,
    latestFilename,
    manifestPath,
  }
}

export function resolveLatestFilenameForTarget(target: string) {
  switch (target) {
    case 'aarch64-apple-darwin':
      return 'latest-arm64-mac.yml'
    case 'aarch64-unknown-linux-gnu':
      return 'latest-arm64-linux-arm64.yml'
    case 'x86_64-apple-darwin':
      return 'latest-x64-mac.yml'
    case 'x86_64-pc-windows-msvc':
      return 'latest-x64.yml'
    case 'x86_64-unknown-linux-gnu':
      return 'latest-x64-linux.yml'
    default:
      throw new Error(`Unsupported update-test target: ${target}`)
  }
}

function encodeBase64Sha512(content: string) {
  return createHash('sha512').update(content).digest('base64')
}

async function main() {
  const cli = cac('generate-update-test-manifest')
    .option('--root <path>', 'Root directory for generated server fixtures', { default: 'scripts/update-test/fixtures/server' })
    .option('--channel <channel>', 'Channel to generate', { default: 'stable' })
    .option('--target <target>', 'Target triple to generate fixtures for', { default: 'x86_64-pc-windows-msvc' })
    .option('--version <version>', 'Version to publish in the generated manifest', { default: '9.9.9-update-test.1' })
    .option('--release-notes <notes>', 'Release notes content', { default: 'Mock update for AIRI local updater verification.' })

  const parsed = cli.parse()
  const result = await generateManifestFixtures({
    channel: String(parsed.options.channel) as UpdateTestChannel,
    releaseNotes: String(parsed.options.releaseNotes),
    rootDir: String(parsed.options.root),
    target: String(parsed.options.target),
    version: String(parsed.options.version),
  })

  // eslint-disable-next-line no-console
  console.log(`Generated ${result.latestFilename} in ${result.channelDir}`)
  // eslint-disable-next-line no-console
  console.log(`Artifact: ${result.artifactFilename}`)
}

async function resolveArtifactFilename(target: string, version: string) {
  const filenames = await getFilenames(target, {
    autoTag: false,
    release: true,
    tag: [version],
  })

  const artifact = filenames.find(entry => !entry.optional && entry.extension !== 'blockmap')
  if (!artifact)
    throw new Error(`Unable to determine artifact filename for target: ${target}`)

  return artifact.releaseArtifactFilename
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    exit(1)
  })
}
