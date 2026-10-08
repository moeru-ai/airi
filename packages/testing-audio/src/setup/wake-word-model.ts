import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { sherpawModelArtifactUrl, sherpawModelPath } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'

/**
 * Checksums of the pinned `kwsModel` revision.
 * A revision change in `kws-model-info.ts` makes the check fail, so the runner never serves an unverified pack.
 */
const files = [
  { name: 'preload.data', sha256: '4ca3ae0d147df1576fac87a4837f5a8959f4f87600a8306c57cc67eb8b40494d' },
  { name: 'preload.js.metadata', sha256: 'e7e223298765f02cdc868d8d1af52fd2c0da6aeef2a5af4122489fd7a8ed1e7b' },
] as const

/** One file of the Sherpaw preload pack. The Web application requests these file names. */
export type WakeWordModelFile = (typeof files)[number]['name']

async function modelDirectory(): Promise<string> {
  const root = await findWorkspaceDir(import.meta.dirname)
  if (!root)
    throw new Error('Could not find the AIRI workspace.')
  return join(root, '.cache', sherpawModelPath(kwsModel))
}

function checksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Downloads and verifies the pinned wake word model in the workspace cache.
 *
 * The Web runner calls this before the file microphone starts, so a slow download does not consume the leading silence
 * of the recording. A cached file with the expected checksum is not downloaded again.
 * Electron does not need this function, because its build bundles the pack.
 *
 * @returns The local path of each verified file.
 */
export async function prepareWakeWordModel(): Promise<Record<WakeWordModelFile, string>> {
  const directory = await modelDirectory()
  await mkdir(directory, { recursive: true })

  const paths = {} as Record<WakeWordModelFile, string>
  for (const file of files) {
    const path = join(directory, file.name)
    const cached = await readFile(path).catch(() => undefined)
    if (cached && checksum(cached) === file.sha256) {
      paths[file.name] = path
      continue
    }

    const response = await fetch(sherpawModelArtifactUrl(kwsModel, file.name))
    if (!response.ok)
      throw new Error(`Could not download the wake word model file ${file.name}: HTTP ${response.status}`)
    const data = new Uint8Array(await response.arrayBuffer())
    if (checksum(data) !== file.sha256)
      throw new Error(`The wake word model file ${file.name} failed its SHA-256 check.`)

    // A rename replaces the cached file in one step, so a parallel case never reads a partial file.
    const temporary = `${path}.${randomUUID()}.download`
    try {
      await writeFile(temporary, data)
      await rename(temporary, path)
    }
    finally {
      await rm(temporary, { force: true })
    }
    paths[file.name] = path
  }

  return paths
}
