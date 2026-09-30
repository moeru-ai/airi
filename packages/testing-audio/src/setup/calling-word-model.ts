import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { findWorkspaceDir } from '@pnpm/find-workspace-dir'
import { sherpawModelArtifactUrl, sherpawModelPath } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { KWS_MODEL } from '@proj-airi/stage-ui/libs/kws-model-info'

const files = [
  { name: 'preload.data', sha256: '4ca3ae0d147df1576fac87a4837f5a8959f4f87600a8306c57cc67eb8b40494d' },
  { name: 'preload.js.metadata', sha256: 'e7e223298765f02cdc868d8d1af52fd2c0da6aeef2a5af4122489fd7a8ed1e7b' },
] as const

async function modelDirectory(): Promise<string> {
  const root = await findWorkspaceDir(import.meta.dirname)
  if (!root)
    throw new Error('Could not find the AIRI workspace.')
  return join(root, '.cache', sherpawModelPath(KWS_MODEL))
}

function checksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Downloads and verifies the pinned model before the file microphone starts. */
export async function prepareCallingWordModel(): Promise<Record<(typeof files)[number]['name'], string>> {
  const directory = await modelDirectory()
  await mkdir(directory, { recursive: true })

  const paths = {} as Record<(typeof files)[number]['name'], string>
  for (const file of files) {
    const path = join(directory, file.name)
    const cached = await readFile(path).catch(() => undefined)
    if (cached && checksum(cached) === file.sha256) {
      paths[file.name] = path
      continue
    }

    const response = await fetch(sherpawModelArtifactUrl(KWS_MODEL, file.name))
    if (!response.ok)
      throw new Error(`Could not download the KWS model file ${file.name}: HTTP ${response.status}`)
    const data = new Uint8Array(await response.arrayBuffer())
    if (checksum(data) !== file.sha256)
      throw new Error(`The KWS model file ${file.name} failed its SHA-256 check.`)

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
