import process from 'node:process'

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { getFilenames } from './utils'

const ROOT_DIR = resolve(import.meta.dirname, '..', '..', '..')
const DOCS_DIR = resolve(ROOT_DIR, 'docs')
const LEADING_V_PATTERN = /^v/

// GitHub releases download URLs
const GITHUB_WINDOWS_RE = /https:\/\/github\.com\/moeru-ai\/airi\/releases\/download\/v[^/]+\/AIRI-[^")\s]+-windows-x64-setup\.exe/g
const GITHUB_MACOS_RE = /https:\/\/github\.com\/moeru-ai\/airi\/releases\/download\/v[^/]+\/AIRI-[^")\s]+-darwin-arm64\.dmg/g

// Aliyun OSS mirror download URLs (used by zh-CN README)
const OSS_WINDOWS_RE = /https:\/\/static-cn-proj-airi\.oss-cn-shanghai\.aliyuncs\.com\/artifacts\/apps\/desktop\/versions\/v[^/]+\/AIRI-[^")\s]+-windows-x64-setup\.exe/g
const OSS_MACOS_RE = /https:\/\/static-cn-proj-airi\.oss-cn-shanghai\.aliyuncs\.com\/artifacts\/apps\/desktop\/versions\/v[^/]+\/AIRI-[^")\s]+-darwin-arm64\.dmg/g

async function main() {
  const version = process.argv[2]
  if (!version) {
    console.error('Usage: tsx update-readme-download-links.ts <version>')
    console.error('Example: tsx update-readme-download-links.ts v0.9.0-alpha.7')
    process.exit(1)
  }

  const cleanVersion = version.replace(LEADING_V_PATTERN, '')
  const releaseOptions = { release: true, autoTag: false, tag: [cleanVersion] }

  const windowsFilenames = await getFilenames('x86_64-pc-windows-msvc', releaseOptions)
  const macosFilenames = await getFilenames('aarch64-apple-darwin', releaseOptions)

  const windowsExe = windowsFilenames.find(f => f.extension === 'exe')?.releaseArtifactFilename
  const macosDmg = macosFilenames.find(f => f.extension === 'dmg')?.releaseArtifactFilename

  if (!windowsExe || !macosDmg) {
    console.error('Failed to determine artifact filenames')
    process.exit(1)
  }

  console.info(`Windows: ${windowsExe}`)
  console.info(`macOS: ${macosDmg}`)

  function updateContent(content: string): string {
    return content
      .replace(GITHUB_WINDOWS_RE, `https://github.com/moeru-ai/airi/releases/download/v${cleanVersion}/${windowsExe}`)
      .replace(GITHUB_MACOS_RE, `https://github.com/moeru-ai/airi/releases/download/v${cleanVersion}/${macosDmg}`)
      .replace(OSS_WINDOWS_RE, `https://github.com/moeru-ai/airi/releases/download/v${cleanVersion}/${windowsExe}`)
      .replace(OSS_MACOS_RE, `https://github.com/moeru-ai/airi/releases/download/v${cleanVersion}/${macosDmg}`)
  }

  const readmeFiles: string[] = [
    resolve(ROOT_DIR, 'README.md'),
  ]

  const docsFiles = await readdir(DOCS_DIR)
  for (const file of docsFiles) {
    if (file.startsWith('README') && file.endsWith('.md')) {
      readmeFiles.push(resolve(DOCS_DIR, file))
    }
  }

  let updatedCount = 0
  for (const filePath of readmeFiles) {
    const content = await readFile(filePath, 'utf-8')
    const updated = updateContent(content)
    if (content !== updated) {
      await writeFile(filePath, updated, 'utf-8')
      console.info(`Updated: ${filePath}`)
      updatedCount++
    }
    else {
      console.info(`No changes: ${filePath}`)
    }
  }

  console.info(`\nDone. Updated ${updatedCount} file(s).`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
