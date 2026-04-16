import type { ArtifactTransformer } from '@proj-airi/vishot-runner-browser'

import path from 'node:path'

import { readFile, rm, writeFile } from 'node:fs/promises'
import { argv, cwd } from 'node:process'

import { Transformer } from '@napi-rs/image'
import { captureBrowserRoots } from '@proj-airi/vishot-runner-browser'

const DEFAULT_AVIF_MAX_WIDTH = 1200
const DEFAULT_AVIF_QUALITY = 35
const DEFAULT_AVIF_SPEED = 6

const sceneAppRoot = path.resolve(cwd())
const formatFlagIndex = argv.findIndex(arg => arg === '--format')
const routeFlagIndex = argv.findIndex(arg => arg === '--route')
const outputDirFlagIndex = argv.findIndex(arg => arg === '--output-dir')
const settleMsFlagIndex = argv.findIndex(arg => arg === '--settle-ms')
const avifMaxWidthFlagIndex = argv.findIndex(arg => arg === '--avif-max-width')
const avifQualityFlagIndex = argv.findIndex(arg => arg === '--avif-quality')
const avifSpeedFlagIndex = argv.findIndex(arg => arg === '--avif-speed')
const requestedFormat = formatFlagIndex >= 0 ? argv[formatFlagIndex + 1] : 'png'
const routePath = routeFlagIndex >= 0 ? argv[routeFlagIndex + 1] : '/docs/setup-and-use'
const settleMs = settleMsFlagIndex >= 0 ? Number(argv[settleMsFlagIndex + 1]) : 500
const avifMaxWidth = avifMaxWidthFlagIndex >= 0 ? Number(argv[avifMaxWidthFlagIndex + 1]) : DEFAULT_AVIF_MAX_WIDTH
const avifQuality = avifQualityFlagIndex >= 0 ? Number(argv[avifQualityFlagIndex + 1]) : DEFAULT_AVIF_QUALITY
const avifSpeed = avifSpeedFlagIndex >= 0 ? Number(argv[avifSpeedFlagIndex + 1]) : DEFAULT_AVIF_SPEED
const outputDir = outputDirFlagIndex >= 0
  ? path.resolve(sceneAppRoot, argv[outputDirFlagIndex + 1])
  : path.resolve(sceneAppRoot, 'artifacts', 'final')

const avifTransformer: ArtifactTransformer = async (artifact) => {
  const derivedFilePath = artifact.filePath.replace(/\.png$/i, '.avif')
  const transformer = new Transformer(await readFile(artifact.filePath))
  const metadata = await transformer.metadata()

  if (metadata.width > avifMaxWidth) {
    const scale = avifMaxWidth / metadata.width
    transformer.resize(avifMaxWidth, Math.round(metadata.height * scale))
  }

  const avifBuffer = await transformer.avif({
    quality: avifQuality,
    speed: avifSpeed,
  })

  await writeFile(derivedFilePath, avifBuffer)
  await rm(artifact.filePath, { force: true })

  return {
    ...artifact,
    filePath: derivedFilePath,
    format: 'avif',
  }
}

if (!['png', 'avif'].includes(requestedFormat)) {
  throw new Error(`Unsupported capture format "${requestedFormat}". Expected "png" or "avif".`)
}

if (!routePath?.startsWith('/')) {
  throw new Error(`Unsupported route path "${routePath}". Route paths must start with "/".`)
}

if (outputDirFlagIndex >= 0 && !argv[outputDirFlagIndex + 1]) {
  throw new Error('Missing value for --output-dir.')
}

if (settleMsFlagIndex >= 0 && !argv[settleMsFlagIndex + 1]) {
  throw new Error('Missing value for --settle-ms.')
}

if (avifMaxWidthFlagIndex >= 0 && !argv[avifMaxWidthFlagIndex + 1]) {
  throw new Error('Missing value for --avif-max-width.')
}

if (avifQualityFlagIndex >= 0 && !argv[avifQualityFlagIndex + 1]) {
  throw new Error('Missing value for --avif-quality.')
}

if (avifSpeedFlagIndex >= 0 && !argv[avifSpeedFlagIndex + 1]) {
  throw new Error('Missing value for --avif-speed.')
}

if (!Number.isFinite(settleMs) || settleMs < 0) {
  throw new Error(`Unsupported settle delay "${argv[settleMsFlagIndex + 1] ?? settleMs}". Expected a number >= 0.`)
}

if (!Number.isFinite(avifMaxWidth) || avifMaxWidth < 1) {
  throw new Error(`Unsupported AVIF max width "${argv[avifMaxWidthFlagIndex + 1] ?? avifMaxWidth}". Expected a number >= 1.`)
}

if (!Number.isFinite(avifQuality) || avifQuality < 0 || avifQuality > 100) {
  throw new Error(`Unsupported AVIF quality "${argv[avifQualityFlagIndex + 1] ?? avifQuality}". Expected a number between 0 and 100.`)
}

if (!Number.isFinite(avifSpeed) || avifSpeed < 1 || avifSpeed > 10) {
  throw new Error(`Unsupported AVIF speed "${argv[avifSpeedFlagIndex + 1] ?? avifSpeed}". Expected a number between 1 and 10.`)
}

await captureBrowserRoots({
  imageTransformers: requestedFormat === 'avif'
    ? [avifTransformer]
    : undefined,
  sceneAppRoot,
  routePath,
  outputDir,
  settleMs,
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
  },
})
