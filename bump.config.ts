import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { defineConfig } from 'bumpp'
import { parse, stringify } from 'smol-toml'
import { x } from 'tinyexec'

export default defineConfig({
  recursive: true,
  commit: 'release: v%s',
  sign: true,
  push: false,
  all: true,
  execute: async () => {
    await x('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', '--dry-run'])

    const cargoTomlFile = await readFile(join(cwd(), 'Cargo.toml'))
    const cargoToml = parse(cargoTomlFile.toString('utf-8')) as {
      workspace?: {
        package?: {
          version?: string
        }
      }
    }

    if (typeof cargoToml !== 'object' || cargoToml === null) {
      throw new TypeError('Cargo.toml does not contain a valid object')
    }
    if (typeof cargoToml.workspace?.package?.version !== 'string') {
      throw new TypeError('Cargo.toml does not contain a valid version in workspace.package.version')
    }

    const packageJSONFile = join(cwd(), 'package.json')
    const packageJSON = JSON.parse(await readFile(packageJSONFile, 'utf-8'))
    if (typeof packageJSON?.version !== 'string' || packageJSON?.version === null) {
      throw new TypeError('package.json does not contain a valid version')
    }

    cargoToml.workspace.package.version = packageJSON.version
    console.info(`Bumping Cargo.toml version to ${cargoToml.workspace.package.version} (from package.json, ${packageJSON.version})`)

    await writeFile(join(cwd(), 'Cargo.toml'), stringify(cargoToml))
    await x('cargo', ['generate-lockfile'])
  },
})
