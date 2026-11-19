import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { exit } from 'node:process'

import { cac } from 'cac'

import * as yaml from 'yaml'

import { hashFile } from './regenerate-windows-latest'

interface FeedFile {
  url: string
  sha512: string
  size?: number
}

/** The installer files that `ergosphere-it register installer --upload-files` uploads. Other files stay out. */
const INSTALLER_EXTENSIONS = ['.zip', '.exe', '.deb', '.rpm', '.AppImage', '.pacman']

async function filesIn(dir: string) {
  const names = await readdir(dir).catch(() => [] as string[])
  const files: string[] = []
  for (const name of names) {
    const path = join(dir, name)
    if ((await stat(path)).isFile())
      files.push(path)
  }

  return files
}

/**
 * Copies each electron-builder feed and the installer files that it lists into `out`, with the names that the feed
 * gives them, so `ergosphere-it register installer --upload-files --dist <out>` can read them.
 *
 * The nightly steps rename the installers, and SignPath signs the Windows installer again, so a file is found by the
 * SHA-512 and the size in its feed, not by its name. A feed in an earlier directory wins: the Windows feed that the
 * workflow writes after signing is in `bundle`, and the feed of electron-builder is in `dist`.
 *
 * @returns The names of the copied installer files.
 */
export async function collectInstallerFiles(options: { dirs: string[], out: string }): Promise<string[]> {
  await mkdir(options.out, { recursive: true })

  const feeds = new Map<string, string>()
  for (const dir of options.dirs) {
    for (const path of await filesIn(dir)) {
      const name = path.slice(dir.length + 1)
      if (/^latest.*\.yml$/.test(name) && !feeds.has(name))
        feeds.set(name, path)
    }
  }
  if (feeds.size === 0)
    throw new Error(`No latest*.yml in ${options.dirs.join(', ')}.`)

  const candidates = (await Promise.all(options.dirs.map(filesIn))).flat().filter(path => INSTALLER_EXTENSIONS.some(extension => path.endsWith(extension)))
  const hashes = new Map<string, Promise<{ sha512: string, size: number }>>()
  const hashOf = (path: string) => {
    if (!hashes.has(path))
      hashes.set(path, Promise.all([hashFile(path), stat(path)]).then(([hash, info]) => ({ sha512: hash.sha512, size: info.size })))

    return hashes.get(path)!
  }

  const copied: string[] = []
  for (const [name, path] of feeds) {
    const text = await readFile(path, 'utf8')
    await writeFile(join(options.out, name), text)

    const feed = yaml.parse(text) as { files?: FeedFile[] }
    for (const file of feed.files ?? []) {
      if (!INSTALLER_EXTENSIONS.some(extension => file.url.endsWith(extension)))
        continue

      let found: string | undefined
      for (const candidate of candidates) {
        const hash = await hashOf(candidate)
        if (hash.sha512 === file.sha512 && (file.size === undefined || hash.size === file.size)) {
          found = candidate
          break
        }
      }
      if (!found)
        throw new Error(`${name} lists ${file.url}, and no file in ${options.dirs.join(', ')} has its SHA-512.`)

      await copyFile(found, join(options.out, file.url))
      copied.push(file.url)
    }
  }

  return copied
}

async function main() {
  const cli = cac('collect-installer-files')
  cli.option('--dir <dir>', 'A directory with feeds or installer files. Earlier directories win.', { type: [String] })
  cli.option('--out <dir>', 'The directory to copy the feeds and the installer files to.')
  const args = cli.parse()

  const dirs = [args.options.dir ?? []].flat().map(dir => String(dir).trim()).filter(Boolean)
  const out = String(args.options.out ?? '').trim()
  if (dirs.length === 0 || !out)
    throw new Error('collect-installer-files needs --dir and --out.')

  const copied = await collectInstallerFiles({ dirs: dirs.map(dir => resolve(dir)), out: resolve(out) })
  console.info(`Collected ${copied.join(', ')} into ${out}.`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error)
    exit(1)
  })
}
