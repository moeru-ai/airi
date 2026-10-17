import type { InferOutput } from 'valibot'

import type { UploadTarget } from '../libs/file-transfer/transfer'

import * as v from 'valibot'

import { authedFetch } from '../libs/auth-fetch'
import { SERVER_URL } from '../libs/server'

const CloudDisplayModelSchema = v.object({
  id: v.string(),
  format: v.picklist(['live2d-zip', 'vrm']),
  name: v.string(),
  originalFilename: v.string(),
  byteSize: v.number(),
  sha256: v.string(),
  revision: v.number(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.nullable(v.string()),
})

const ReserveUploadResponseSchema = v.object({
  upload: v.nullable(v.object({
    uploadId: v.string(),
    method: v.literal('PUT'),
    url: v.string(),
    headers: v.record(v.string(), v.string()),
  })),
})

const DownloadResponseSchema = v.object({
  url: v.string(),
  byteSize: v.number(),
  sha256: v.string(),
})

export type CloudDisplayModel = InferOutput<typeof CloudDisplayModelSchema>

export interface ReserveUploadInput {
  id: string
  requestId: string
  format: CloudDisplayModel['format']
  name: string
  originalFilename: string
  byteSize: number
  sha256: string
}

const base = `${SERVER_URL}/api/v1/display-models`

async function readJson<TSchema extends v.GenericSchema>(response: Response, schema: TSchema): Promise<v.InferOutput<TSchema>> {
  if (!response.ok)
    throw new Error(`Display model request failed with status ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return v.parse(schema, await response.json())
}

function jsonRequest(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }
}

/** Lists ready models and deletion markers of the signed-in account. */
export async function listCloudDisplayModels(signal?: AbortSignal) {
  const response = await authedFetch(base, { signal })
  return (await readJson(response, v.object({ models: v.array(CloudDisplayModelSchema) }))).models
}

/** Reserves quota and returns a signed target. `upload` is null when the cloud already has the same bytes. */
export async function reserveDisplayModelUpload(input: ReserveUploadInput, signal?: AbortSignal): Promise<{ uploadId: string } & UploadTarget | null> {
  const { upload } = await readJson(await authedFetch(`${base}/uploads`, jsonRequest('POST', input, signal)), ReserveUploadResponseSchema)
  return upload
}

export async function completeDisplayModelUpload(uploadId: string, signal?: AbortSignal) {
  return readJson(await authedFetch(`${base}/uploads/${encodeURIComponent(uploadId)}/complete`, { method: 'POST', signal }), CloudDisplayModelSchema)
}

export async function requestDisplayModelDownload(id: string, signal?: AbortSignal) {
  return readJson(await authedFetch(`${base}/${encodeURIComponent(id)}/download`, { method: 'POST', signal }), DownloadResponseSchema)
}

export async function renameCloudDisplayModel(id: string, name: string, revision: number) {
  return readJson(await authedFetch(`${base}/${encodeURIComponent(id)}`, jsonRequest('PATCH', { name, revision })), CloudDisplayModelSchema)
}

export async function deleteCloudDisplayModel(id: string, revision: number) {
  const response = await authedFetch(`${base}/${encodeURIComponent(id)}?revision=${revision}`, { method: 'DELETE' })
  if (!response.ok)
    throw new Error(`Display model delete failed with status ${response.status}`)
}
