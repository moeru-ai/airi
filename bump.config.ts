import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { defineConfig } from 'bumpp'
import { parse, stringify } from 'smol-toml'
import { x } from 'tinyexec'

const androidVersionFile = join(cwd(), 'apps/stage-pocket/android/app-version.properties')

const androidVersionCodePattern = /^AIRI_VERSION_CODE=(\d+)$/m

async function syncCargoToml() {
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
}

async function syncAndroidVersion(version: string) {
  const androidVersionContent = await readFile(androidVersionFile, 'utf-8')
  const currentVersionCodeMatch = androidVersionContent.match(androidVersionCodePattern)

  if (!currentVersionCodeMatch) {
    throw new TypeError('Android version file does not contain a valid AIRI_VERSION_CODE')
  }

  const currentVersionCode = Number.parseInt(currentVersionCodeMatch[1], 10)

  if (!Number.isSafeInteger(currentVersionCode) || currentVersionCode < 1) {
    throw new TypeError(`Android AIRI_VERSION_CODE is invalid: ${currentVersionCodeMatch[1]}`)
  }

  const nextVersionCode = currentVersionCode + 1
  const nextAndroidVersionContent = `AIRI_VERSION_NAME=${version}\nAIRI_VERSION_CODE=${nextVersionCode}\n`

  await writeFile(androidVersionFile, nextAndroidVersionContent)
  console.info(`Bumping Android version to ${version} (${currentVersionCode} -> ${nextVersionCode})`)
}

export default defineConfig({
  recursive: true,
  commit: 'release: v%s',
  sign: false,
  push: false,
  all: true,
  execute: async (operation) => {
    await x('pnpm', ['publish', '-r', '--access', 'public', '--no-git-checks', '--dry-run'])
    const nextVersion = operation.state.newVersion

    await syncCargoToml()
    await syncAndroidVersion(nextVersion)
    await x('cargo', ['generate-lockfile'])
  },
})
