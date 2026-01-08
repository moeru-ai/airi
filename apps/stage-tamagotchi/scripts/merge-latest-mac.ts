import { existsSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { exit } from 'node:process'

import { cac } from 'cac'

import * as yaml from 'yaml'

interface UpdateInfoFile {
  url: string
  sha2?: string
  sha512?: string
  size?: number
}

interface UpdateInfo {
  files?: UpdateInfoFile[]
  path?: string
  sha2?: string
  sha512?: string
  [key: string]: unknown
}

type Platform = 'x64' | 'arm64' | 'both' | 'none'

function detectPlatform(updateInfo: UpdateInfo): Platform {
  const urls: string[] = []
  if (Array.isArray(updateInfo.files)) {
    for (const file of updateInfo.files) {
      if (typeof file?.url === 'string') {
        urls.push(file.url)
      }
    }
  }
  if (typeof updateInfo.path === 'string') {
    urls.push(updateInfo.path)
  }

  // eslint-disable-next-line regexp/no-unused-capturing-group
  const hasArm64 = urls.some(url => /(^|[-_/])arm64([-.]|$)/i.test(url))
  // eslint-disable-next-line regexp/no-unused-capturing-group
  const hasX64FromName = urls.some(url => /(^|[-_/])x64([-.]|$)/i.test(url))
  const hasMacZip = urls.some(url => /-mac\.zip$/i.test(url) && !/arm64/i.test(url))
  const hasX64 = hasX64FromName || hasMacZip

  if (hasX64 && hasArm64) {
    return 'both'
  }
  if (hasX64) {
    return 'x64'
  }
  if (hasArm64) {
    return 'arm64'
  }
  return 'none'
}

function mergeFiles(arm64: UpdateInfo, x64: UpdateInfo): UpdateInfo {
  const arm64Files = Array.isArray(arm64.files) ? arm64.files : []
  const x64Files = Array.isArray(x64.files) ? x64.files : []

  const byUrl = new Map<string, UpdateInfoFile>()
  for (const file of [...arm64Files, ...x64Files]) {
    if (file?.url) {
      byUrl.set(file.url, file)
    }
  }

  return {
    ...arm64,
    files: [...byUrl.values()],
  }
}

async function readUpdateInfo(filePath: string): Promise<UpdateInfo> {
  const raw = await readFile(filePath, 'utf8')
  return yaml.parse(raw) as UpdateInfo
}

async function main() {
  const cli = cac('merge-latest-mac')
    .option('--input <path>', 'Input latest-mac yml file', { default: [], type: [String] })
    .option('--dir <path>', 'Scan directory for latest-mac*.yml files', { default: '' })
    .option('--output <path>', 'Output file path', { default: '' })

  const args = cli.parse()
  const inputs = (args.options.input as string[]).filter(Boolean)
  const dir = String(args.options.dir || '').trim()

  let files: string[] = []
  if (inputs.length > 0) {
    files = inputs.map(file => resolve(file))
  }
  else {
    const scanDir = dir || resolve('bundle')
    const candidates = readdirSync(scanDir).filter(
      file => file.startsWith('latest-mac') && file.endsWith('.yml'),
    )
    files = candidates.map(file => resolve(scanDir, file))
  }

  if (files.length === 0) {
    throw new Error('No latest-mac*.yml files found')
  }

  const entries: { filePath: string, updateInfo: UpdateInfo, platform: Platform }[] = []
  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue
    }
    const updateInfo = await readUpdateInfo(filePath)
    const platform = detectPlatform(updateInfo)
    entries.push({ filePath, updateInfo, platform })
  }

  if (entries.length === 0) {
    throw new Error('No readable latest-mac*.yml files found')
  }

  const outputPath = String(args.options.output || '').trim()
    || resolve(dir || 'bundle', 'latest-mac.yml')
  await mkdir(dirname(outputPath), { recursive: true })

  const mergedEntry = entries.find(entry => entry.platform === 'both')
  if (mergedEntry) {
    await writeFile(outputPath, yaml.stringify(mergedEntry.updateInfo), 'utf8')
    return
  }

  const x64Entries = entries.filter(entry => entry.platform === 'x64')
  const arm64Entries = entries.filter(entry => entry.platform === 'arm64')

  if (x64Entries.length === 0 && arm64Entries.length === 0) {
    throw new Error('No x64 or arm64 update info found')
  }

  if (x64Entries.length === 0) {
    await writeFile(outputPath, yaml.stringify(arm64Entries[0].updateInfo), 'utf8')
    return
  }

  if (arm64Entries.length === 0) {
    await writeFile(outputPath, yaml.stringify(x64Entries[0].updateInfo), 'utf8')
    return
  }

  const merged = mergeFiles(arm64Entries[0].updateInfo, x64Entries[0].updateInfo)
  await writeFile(outputPath, yaml.stringify(merged), 'utf8')
}

main().catch((error) => {
  console.error(error)
  exit(1)
})
