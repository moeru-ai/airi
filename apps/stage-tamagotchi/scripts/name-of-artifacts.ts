import process from 'node:process'

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { cac } from 'cac'

import { getFilename } from './utils'

async function main() {
  const cli = cac('name-of-artifact')
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
    .option(
      '--out <path>',
      'Path to output the filename',
      { default: '', type: [String] },
    )

  const args = cli.parse()

  const argOptions = args.options as {
    release: boolean
    autoTag: boolean
    tag: string[]
    out: string[]
  }

  const target = args.args[0]
  const filename = await getFilename(target, argOptions)
  if (argOptions.out[0]) {
    if (!existsSync(dirname(argOptions.out[0]))) {
      mkdirSync(dirname(argOptions.out[0]), { recursive: true })
    }

    writeFileSync(argOptions.out[0], filename, { encoding: 'utf-8' })
  }
  else {
    console.log(filename)
  }
}

main()
  .catch((error) => {
    console.error('Error during generating name:', error)
    process.exit(1)
  })
