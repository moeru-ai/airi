import type { Database } from '../../libs/db'
import type { ObjectStore } from '../adapters/object-store'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createDisplayModelService } from './display-models'
import { createUploadSessionService } from './upload-sessions'

import * as schema from '../../schemas'

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex')
}

function createFakeStore() {
  const objects = new Map<string, Buffer>()
  const store = {
    objects,
    async createUploadTarget(input: { Key?: string, ChecksumSHA256?: string }) {
      return { url: `https://store.test/${input.Key}`, headers: { 'x-amz-checksum-sha256': input.ChecksumSHA256 ?? '', 'if-none-match': '*' } }
    },
    async createDownloadUrl(key: string) {
      return `https://store.test/${key}?download`
    },
    async inspectObject(key: string) {
      const body = objects.get(key)
      if (!body)
        throw Object.assign(new Error('missing'), { $metadata: { httpStatusCode: 404 } })
      return { ContentLength: body.length, ChecksumSHA256: createHash('sha256').update(body).digest('base64') }
    },
    async getObject(key: string, range?: string) {
      const end = Number(range?.split('-')[1] ?? Infinity)
      const body = objects.get(key)!.subarray(0, end + 1)
      return { Body: { transformToByteArray: async () => new Uint8Array(body) } }
    },
    async deleteObject(key: string) {
      objects.delete(key)
    },
  }
  return store as typeof store & ObjectStore
}

const zipBytes = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('model')])

function reserveInput(bytes = zipBytes, overrides = {}) {
  return { id: 'display-model-a', requestId: 'req-1', format: 'live2d-zip' as const, name: 'Hiyori', originalFilename: 'hiyori.zip', byteSize: bytes.length, sha256: sha256(bytes), ...overrides }
}

describe('displayModelService', () => {
  let db: Database
  let store: ReturnType<typeof createFakeStore>

  function createService(limits?: { maxFileBytes: number, quotaBytes: number }) {
    return createDisplayModelService(db, store, createUploadSessionService(store), limits)
  }

  async function upload(service: ReturnType<typeof createService>, owner: string, bytes = zipBytes, overrides = {}) {
    const { upload: target } = await service.reserveUpload(owner, reserveInput(bytes, overrides))
    store.objects.set(new URL(target!.url).pathname.slice(1), bytes)
    return service.completeUpload(owner, target!.uploadId)
  }

  beforeEach(async () => {
    db = await mockDB(schema)
    store = createFakeStore()
  })

  it('publishes a model only after its bytes verify', async () => {
    const service = createService()
    const { upload: target } = await service.reserveUpload('owner', reserveInput())

    expect(target!.url).toContain('display-models/owner/display-model-a/')
    expect(await service.list('owner')).toEqual([])
    await expect(service.completeUpload('owner', target!.uploadId)).rejects.toMatchObject({ statusCode: 409 })

    store.objects.set(new URL(target!.url).pathname.slice(1), zipBytes)
    const model = await service.completeUpload('owner', target!.uploadId)

    expect(model).toMatchObject({ id: 'display-model-a', revision: 1, byteSize: zipBytes.length })
    expect(await service.list('owner')).toHaveLength(1)
    expect(await service.completeUpload('owner', target!.uploadId)).toEqual(model)
  })

  it('rejects and removes bytes that do not match the reservation', async () => {
    const service = createService()
    const { upload: target } = await service.reserveUpload('owner', reserveInput())
    const key = new URL(target!.url).pathname.slice(1)
    store.objects.set(key, Buffer.from('wrong bytes!'.padEnd(zipBytes.length, '.')))

    await expect(service.completeUpload('owner', target!.uploadId)).rejects.toMatchObject({ statusCode: 422 })
    expect(store.objects.has(key)).toBe(false)
    expect(await service.list('owner')).toEqual([])
  })

  it('rejects a file whose signature does not match its format', async () => {
    const service = createService()
    const bytes = Buffer.from('not a zip file')
    const { upload: target } = await service.reserveUpload('owner', reserveInput(bytes))
    store.objects.set(new URL(target!.url).pathname.slice(1), bytes)

    await expect(service.completeUpload('owner', target!.uploadId)).rejects.toMatchObject({ statusCode: 422 })
  })

  it('returns the same session for a replayed request id and rejects a changed one', async () => {
    const service = createService()
    const first = await service.reserveUpload('owner', reserveInput())
    const replay = await service.reserveUpload('owner', reserveInput())

    expect(replay.upload!.uploadId).toBe(first.upload!.uploadId)
    await expect(service.reserveUpload('owner', reserveInput(zipBytes, { sha256: 'a'.repeat(64) }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('skips the upload for a ready model with the same bytes and rejects different bytes', async () => {
    const service = createService()
    await upload(service, 'owner')

    expect((await service.reserveUpload('owner', reserveInput(zipBytes, { requestId: 'req-2' }))).upload).toBeNull()
    const other = Buffer.concat([zipBytes, Buffer.from('x')])
    await expect(service.reserveUpload('owner', reserveInput(other, { requestId: 'req-3' }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('enforces file size and account quota, counting pending reservations', async () => {
    const service = createService({ maxFileBytes: zipBytes.length, quotaBytes: zipBytes.length * 2 })

    await expect(service.reserveUpload('owner', reserveInput(Buffer.concat([zipBytes, zipBytes])))).rejects.toMatchObject({ statusCode: 413 })
    await service.reserveUpload('owner', reserveInput())
    await service.reserveUpload('owner', reserveInput(zipBytes, { id: 'display-model-b', requestId: 'req-2' }))
    await expect(service.reserveUpload('owner', reserveInput(zipBytes, { id: 'display-model-c', requestId: 'req-3' }))).rejects.toMatchObject({ statusCode: 402 })
  })

  it('hides models, uploads, and downloads from other accounts', async () => {
    const service = createService()
    const { upload: target } = await service.reserveUpload('owner', reserveInput())
    store.objects.set(new URL(target!.url).pathname.slice(1), zipBytes)

    await expect(service.completeUpload('intruder', target!.uploadId)).rejects.toMatchObject({ statusCode: 404 })
    await service.completeUpload('owner', target!.uploadId)
    await expect(service.createDownload('intruder', 'display-model-a')).rejects.toMatchObject({ statusCode: 404 })
    expect(await service.list('intruder')).toEqual([])
    expect(await service.createDownload('owner', 'display-model-a')).toMatchObject({ sha256: sha256(zipBytes) })
  })

  it('renames and deletes with revision checks and leaves a deletion marker', async () => {
    const service = createService()
    const model = await upload(service, 'owner')

    await expect(service.rename('owner', model.id, 'Stale', model.revision + 1)).rejects.toMatchObject({ statusCode: 409 })
    const renamed = await service.rename('owner', model.id, 'Renamed', model.revision)
    expect(renamed).toMatchObject({ name: 'Renamed', revision: model.revision + 1 })

    await expect(service.remove('owner', model.id, model.revision)).rejects.toMatchObject({ statusCode: 409 })
    await service.remove('owner', model.id, renamed.revision)

    const [marker] = await service.list('owner')
    expect(marker.deletedAt).not.toBeNull()
    await expect(service.createDownload('owner', model.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(service.reserveUpload('owner', reserveInput(zipBytes, { requestId: 'req-9' }))).rejects.toMatchObject({ statusCode: 409 })
  })
})
