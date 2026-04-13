import type { ArtifactTransformer } from '@proj-airi/vishot-runner-browser'

import path from 'node:path'

import { readFile, rm, writeFile } from 'node:fs/promises'
import { argv, cwd } from 'node:process'

import { Transformer } from '@napi-rs/image'
import { captureBrowserRoots } from '@proj-airi/vishot-runner-browser'

const sceneAppRoot = path.resolve(cwd())
const outputDir = path.resolve(sceneAppRoot, 'artifacts', 'final')
const formatFlagIndex = argv.findIndex(arg => arg === '--format')
const requestedFormat = formatFlagIndex >= 0 ? argv[formatFlagIndex + 1] : 'png'

const avifTransformer: ArtifactTransformer = async (artifact) => {
  const derivedFilePath = artifact.filePath.replace(/\.png$/i, '.avif')
  const avifBuffer = await new Transformer(await readFile(artifact.filePath)).avif()

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

await captureBrowserRoots({
  imageTransformers: requestedFormat === 'avif'
    ? [avifTransformer]
    : undefined,
  sceneAppRoot,
  routePath: '/',
  outputDir,
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
  },
})
