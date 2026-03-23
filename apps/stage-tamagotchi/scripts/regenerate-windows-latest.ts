import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { exit } from 'node:process'

import { cac } from 'cac'

import * as yaml from 'yaml'

interface UpdateFileInfo {
  url: string
  sha512: string
  size?: number
}

interface WindowsUpdateInfo {
  version: string
  files: UpdateFileInfo[]
  path: string
  sha512: string
  sha2?: string
  releaseDate?: string
  [key: string]: unknown
}

async function hashFile(filePath: string): Promise<{ sha512: string, sha256: string }> {
  return await new Promise((resolveHash, reject) => {
    const sha512 = createHash('sha512')
    const sha256 = createHash('sha256')
    const stream = createReadStream(filePath)

    stream.on('data', (chunk) => {
      sha512.update(chunk)
      sha256.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => {
      resolveHash({
        sha512: sha512.digest('base64'),
        sha256: sha256.digest('hex'),
      })
    })
  })
}

async function readExistingUpdateInfo(filePath: string): Promise<Partial<WindowsUpdateInfo>> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return (yaml.parse(raw) ?? {}) as Partial<WindowsUpdateInfo>
  }
  catch {
    return {}
  }
}

async function main() {
  const cli = cac('regenerate-windows-latest')
    .option('--input <path>', 'Signed Windows installer path', { type: [String] })
    .option('--output <path>', 'Output latest.yml path', { default: 'bundle/latest.yml' })
    .option('--version <version>', 'Version to write into latest.yml', { type: [String] })
    .option('--release-date <date>', 'Release date to write into latest.yml', { type: [String] })

  const args = cli.parse()

  const input = String(args.options.input?.[0] || '').trim()
  const output = String(args.options.output || '').trim()
  const version = String(args.options.version?.[0] || '').trim()
  const releaseDate = String(args.options.releaseDate?.[0] || '').trim()

  if (!input) {
    throw new Error('--input is required')
  }
  if (!output) {
    throw new Error('--output is required')
  }
  if (!version) {
    throw new Error('--version is required')
  }

  const inputPath = resolve(input)
  const outputPath = resolve(output)
  const fileStats = await stat(inputPath)
  const { sha512, sha256 } = await hashFile(inputPath)
  const existing = await readExistingUpdateInfo(outputPath)
  const url = basename(inputPath)

  const nextUpdateInfo: WindowsUpdateInfo = {
    ...existing,
    version,
    files: [
      {
        url,
        sha512,
        size: fileStats.size,
      },
    ],
    path: url,
    sha512,
    sha2: sha256,
    releaseDate: releaseDate || existing.releaseDate || new Date().toISOString(),
  }

  await writeFile(outputPath, yaml.stringify(nextUpdateInfo), 'utf8')
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
