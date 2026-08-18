import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { defineConfig } from 'bumpp'
import { x } from 'tinyexec'

const androidVersionFile = join(cwd(), 'apps/stage-pocket/android/app-version.properties')

const androidVersionCodePattern = /^AIRI_VERSION_CODE=(\d+)$/m

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

const iOSProjectFile = join(cwd(), 'apps/stage-pocket/ios/App/App.xcodeproj/project.pbxproj')

const iOSMarketingVersionPattern = /MARKETING_VERSION = .*?;/g
const iOSMarketingVersionTrimPattern = /-.+$/g
const iOSProjectVersionPattern = /CURRENT_PROJECT_VERSION = (\d+);/
const iOSProjectVersionPatternGlobal = /CURRENT_PROJECT_VERSION = (\d+);/g

async function syncIOSVersion(version: string) {
  const pbxproj = await readFile(iOSProjectFile, 'utf-8')
  const currentVersionMatch = pbxproj.match(iOSProjectVersionPattern)
  if (!currentVersionMatch) {
    throw new TypeError('iOS project file does not contain a valid CURRENT_PROJECT_VERSION')
  }

  const currentBuildNumber = Number.parseInt(currentVersionMatch[1], 10)
  if (!Number.isSafeInteger(currentBuildNumber) || currentBuildNumber < 1) {
    throw new TypeError(`iOS CURRENT_PROJECT_VERSION is invalid: ${currentVersionMatch[1]}`)
  }

  const nextBuildNumber = currentBuildNumber + 1
  const strictVersion = version.replace(iOSMarketingVersionTrimPattern, '')
  const updatedPbxproj = pbxproj
    .replace(iOSMarketingVersionPattern, `MARKETING_VERSION = ${strictVersion};`)
    .replace(iOSProjectVersionPatternGlobal, `CURRENT_PROJECT_VERSION = ${nextBuildNumber};`)

  await writeFile(iOSProjectFile, updatedPbxproj)
  console.info(`Bumping iOS version to ${version} (${currentBuildNumber} -> ${nextBuildNumber})`)
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
    await syncAndroidVersion(nextVersion)
    await syncIOSVersion(nextVersion)
  },
})
