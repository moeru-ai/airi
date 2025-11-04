import process from 'node:process'

import { cac } from 'cac'

import { getElectronBuilderConfig, getFilenames, getVersion } from './utils'

async function main() {
  const cli = cac('name-of-artifact')
    .option(
      '--release',
      'Rename with version from package.json',
      { default: false },
    )
    .option(
      '--get-filename <ext>',
      'Get the release artifact filename for a specific extension (e.g., deb, rpm, dmg, exe)',
      { default: '', type: [String] },
    )
    .option(
      '--get-output-filename <ext>',
      'Get the build output filename for a specific extension (pre-rename)',
      { default: '', type: [String] },
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
    .option(
      '--get-bundle-name',
      'Get the bundle name',
      { default: false },
    )
    .option(
      '--get-product-name',
      'Get the product name',
      { default: false },
    )
    .option(
      '--get-version',
      'Get the version',
      { default: false },
    )

  const args = cli.parse()

  const argOptions = args.options as {
    release: boolean
    autoTag: boolean
    tag: string[]
    getBundleName: boolean
    getProductName: boolean
    getVersion: boolean
    getFilename: string[]
    getOutputFilename: string[]
  }

  const target = args.args[0]
  if (argOptions.getBundleName) {
    const filenames = await getFilenames(target, argOptions)
    console.info(filenames[0].releaseArtifactFilename)
  }
  if (argOptions.getFilename && argOptions.getFilename[0]) {
    const ext = String(argOptions.getFilename[0]).trim()
    const filenames = await getFilenames(target, argOptions)
    const match = filenames.find(f => f.extension === ext)
    if (!match) {
      console.error(`No artifact found for extension: ${ext}`)
      process.exit(1)
    }
    console.info(match.releaseArtifactFilename)
  }
  if (argOptions.getOutputFilename && argOptions.getOutputFilename[0]) {
    const ext = String(argOptions.getOutputFilename[0]).trim()
    const filenames = await getFilenames(target, argOptions)
    const match = filenames.find(f => f.extension === ext)
    if (!match) {
      console.error(`No artifact found for extension: ${ext}`)
      process.exit(1)
    }
    console.info(match.outputFilename)
  }
  if (argOptions.getProductName) {
    const electronBuilderConfig = await getElectronBuilderConfig()
    console.info(electronBuilderConfig.productName)
  }
  if (argOptions.getVersion) {
    const version = await getVersion({ release: argOptions.release, autoTag: argOptions.autoTag, tag: argOptions.tag })
    console.info(version)
  }
}

main()
  .catch((error) => {
    console.error('Error during generating name:', error)
    process.exit(1)
  })
