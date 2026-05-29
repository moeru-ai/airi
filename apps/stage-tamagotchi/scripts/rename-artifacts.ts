import process from 'node:process'

import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import { cac } from 'cac'

import packageJSON from '../package.json' assert { type: 'json' }

import { getElectronBuilderConfig, getFilenames, getVersion } from './utils'

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
  const electronBuilderConfig = await getElectronBuilderConfig()
  const target = args.args[0]
  const productName = electronBuilderConfig.productName
  const dirname = import.meta.dirname

  const beforeVersion = version
  const beforeProductName = productName

  const argOptions = args.options as {
    release: boolean
    autoTag: boolean
    tag: string[]
  }

  version = await getVersion(argOptions)

  console.info('target:', target)
  console.info('dirname', dirname)
  console.info('version from:', beforeVersion, 'to:', version)
  console.info('product name from:', beforeProductName, 'to:', productName)

  if (!target) {
    throw new Error('<Target> is required')
  }

  const srcPrefix = join(dirname, '..', 'dist')
  console.info('source directory:', srcPrefix)
  const bundlePrefix = join(dirname, '..', 'bundle')
  console.info('bundle directory:', bundlePrefix)

  console.info('renaming directory from:', srcPrefix)
  console.info('renaming directory to:', bundlePrefix)
  console.info(readdirSync(srcPrefix))

  mkdirSync(bundlePrefix, { recursive: true })

  const filenames = await getFilenames(target, argOptions)
  console.info(filenames, 'is the target filename')

  for (const filename of filenames) {
    const renameFrom = join(srcPrefix, filename.outputFilename)
    const renameTo = join(bundlePrefix, filename.releaseArtifactFilename)
    console.info('renaming, from:', renameFrom, 'to:', renameTo)
    if (!existsSync(renameFrom)) {
      const message = `missing artifact: ${renameFrom}`
      if (filename.optional) {
        console.warn(message)
        continue
      }
      throw new Error(message)
    }
    renameSync(renameFrom, renameTo)
  }
}

main()
  .then(() => {
    console.info('Renaming completed successfully.')
  })
  .catch((error) => {
    console.error('Error during renaming:', error)
    process.exit(1)
  })
