import type { InferOutput } from 'valibot'

import type { Database } from '../../libs/db'
import type { DisplayModelRow } from '../../schemas/display-models'
import type { ObjectStore } from '../adapters/object-store'
import type { UploadSessionService } from './upload-sessions'

import { Buffer } from 'node:buffer'

import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import * as v from 'valibot'

import { displayModels } from '../../schemas/display-models'
import { createBadRequestError, createConflictError, createNotFoundError, createPayloadTooLargeError, createPaymentRequiredError } from '../../utils/error'

const PURPOSE = 'display-model'
const DOWNLOAD_EXPIRES_IN_SECONDS = 900

const FORMATS = {
  'live2d-zip': { extension: 'zip', contentType: 'application/zip', signature: Buffer.from([0x50, 0x4B, 0x03, 0x04]) },
  'vrm': { extension: 'vrm', contentType: 'model/gltf-binary', signature: Buffer.from('glTF') },
} as const

export const DisplayModelIdSchema = v.pipe(v.string(), v.regex(/^[\w-]{1,128}$/), v.check(id => !id.startsWith('preset-'), 'Preset ids are reserved'))
const RevisionSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
const NameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const ReserveDisplayModelUploadSchema = v.object({
  id: DisplayModelIdSchema,
  requestId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  format: v.picklist(['live2d-zip', 'vrm']),
  name: NameSchema,
  originalFilename: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  byteSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
  sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
})

export const RenameDisplayModelSchema = v.object({ name: NameSchema, revision: RevisionSchema })
export const DeleteDisplayModelQuerySchema = v.object({ revision: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), RevisionSchema) })

export type ReserveDisplayModelUploadInput = InferOutput<typeof ReserveDisplayModelUploadSchema>

export interface DisplayModelLimits {
  /** Largest accepted original file. */
  maxFileBytes: number
  /** Largest total of live models and pending uploads per account. */
  quotaBytes: number
}

export const DEFAULT_DISPLAY_MODEL_LIMITS: DisplayModelLimits = {
  maxFileBytes: 512 * 1024 * 1024,
  quotaBytes: 2 * 1024 * 1024 * 1024,
}

function publicModel(row: DisplayModelRow) {
  return {
    id: row.id,
    format: row.format,
    name: row.name,
    originalFilename: row.originalFilename,
    byteSize: row.byteSize,
    sha256: row.sha256,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  }
}

/**
 * Private per-account directory of imported display models.
 *
 * Use when:
 * - Clients sync Live2D ZIP and VRM originals between devices.
 *
 * Expects:
 * - Routes parse input with the exported schemas and pass the authenticated owner.
 *
 * Returns:
 * - Metadata, upload targets, and temporary download URLs. Bytes never pass through the API.
 */
export function createDisplayModelService(
  db: Database,
  objectStore: ObjectStore,
  uploads: UploadSessionService,
  limits: DisplayModelLimits = DEFAULT_DISPLAY_MODEL_LIMITS,
) {
  async function findModel(ownerId: string, id: string) {
    const [row] = await db.select().from(displayModels).where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, id)))
    return row
  }

  async function requireLiveModel(ownerId: string, id: string) {
    const row = await findModel(ownerId, id)
    if (!row || row.status !== 'ready' || row.deletedAt)
      throw createNotFoundError('Display model not found')
    return row
  }

  return {
    /** Lists ready models and deletion markers. Pending uploads stay hidden from other devices. */
    async list(ownerId: string) {
      const rows = await db.select().from(displayModels).where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.status, 'ready')))
      return rows.map(publicModel)
    },

    /** Reserves quota and signs an upload. Returns `upload: null` when the same bytes are already stored. */
    async reserveUpload(ownerId: string, input: ReserveDisplayModelUploadInput) {
      if (input.byteSize > limits.maxFileBytes)
        throw createPayloadTooLargeError('The model file is too large', 'DISPLAY_MODEL_TOO_LARGE')

      const format = FORMATS[input.format]
      const session = await db.transaction(async (tx) => {
        await uploads.lockOwner(tx, ownerId)

        const replay = await uploads.findByRequest(tx, ownerId, PURPOSE, input.requestId)
        if (replay) {
          if (replay.subjectId !== input.id || replay.expectedSha256 !== input.sha256 || replay.expectedSize !== input.byteSize)
            throw createConflictError('The request id was used for a different upload')
          return replay
        }

        const existing = await tx.select().from(displayModels).where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, input.id)))
        const current = existing[0]
        if (current?.deletedAt)
          throw createConflictError('The display model was deleted. Import it again as a new model.')
        if (current?.status === 'ready') {
          if (current.sha256 === input.sha256)
            return null
          throw createConflictError('A different model already uses this id. Replace it with a new model id.')
        }

        const [{ ready }] = await tx
          .select({ ready: sql<number>`coalesce(sum(${displayModels.byteSize}), 0)::float8` })
          .from(displayModels)
          .where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.status, 'ready'), isNull(displayModels.deletedAt), ne(displayModels.id, input.id)))
        const reserved = await uploads.reservedBytes(tx, ownerId, PURPOSE, input.id)
        if (ready + reserved + input.byteSize > limits.quotaBytes)
          throw createPaymentRequiredError('The display model storage quota is full', { code: 'DISPLAY_MODEL_QUOTA_EXCEEDED' })

        await tx.insert(displayModels).values({
          id: input.id,
          ownerId,
          format: input.format,
          name: input.name,
          originalFilename: input.originalFilename,
          byteSize: input.byteSize,
          sha256: input.sha256,
        }).onConflictDoUpdate({
          target: [displayModels.ownerId, displayModels.id],
          set: { format: input.format, name: input.name, originalFilename: input.originalFilename, byteSize: input.byteSize, sha256: input.sha256, updatedAt: new Date() },
        })

        return uploads.reserve(tx, {
          ownerId,
          purpose: PURPOSE,
          subjectId: input.id,
          requestId: input.requestId,
          contentType: format.contentType,
          size: input.byteSize,
          sha256: input.sha256,
          keyFor: uploadId => `display-models/${ownerId}/${input.id}/${uploadId}/original.${format.extension}`,
        })
      })

      if (!session || session.status === 'completed')
        return { upload: null }
      return { upload: await uploads.createTarget(session) }
    },

    /** Verifies the stored bytes and publishes the model. Safe to call again after success. */
    async completeUpload(ownerId: string, uploadId: string) {
      const session = await uploads.findOwned(db, ownerId, uploadId)
      if (!session || session.purpose !== PURPOSE)
        throw createNotFoundError('Upload not found')

      const model = await findModel(ownerId, session.subjectId)
      if (!model)
        throw createNotFoundError('Display model not found')
      if (session.status === 'completed')
        return publicModel(model)
      if (session.status === 'aborted')
        throw createConflictError('The upload was aborted. Start a new upload.')

      await uploads.verify(db, session, { signature: FORMATS[model.format].signature })

      return db.transaction(async (tx) => {
        if (await uploads.markCompleted(tx, session.id)) {
          const [published] = await tx.update(displayModels)
            .set({ status: 'ready', objectKey: session.objectKey, revision: sql`${displayModels.revision} + 1`, updatedAt: new Date() })
            .where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, session.subjectId)))
            .returning()
          return publicModel(published)
        }
        const [current] = await tx.select().from(displayModels).where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, session.subjectId)))
        return publicModel(current)
      })
    },

    async createDownload(ownerId: string, id: string) {
      const row = await requireLiveModel(ownerId, id)
      return {
        url: await objectStore.createDownloadUrl(row.objectKey!),
        expiresInSeconds: DOWNLOAD_EXPIRES_IN_SECONDS,
        byteSize: row.byteSize,
        sha256: row.sha256,
      }
    },

    async rename(ownerId: string, id: string, name: string, revision: number) {
      const [row] = await db.update(displayModels)
        .set({ name, revision: sql`${displayModels.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, id), eq(displayModels.status, 'ready'), isNull(displayModels.deletedAt), eq(displayModels.revision, revision)))
        .returning()
      if (row)
        return publicModel(row)
      await requireLiveModel(ownerId, id)
      throw createConflictError('The display model changed on another device')
    },

    /**
     * Writes a deletion marker. The object stays until an external cleanup removes it,
     * after outstanding signed URLs expire.
     */
    async remove(ownerId: string, id: string, revision: number) {
      const rows = await db.update(displayModels)
        .set({ deletedAt: new Date(), revision: sql`${displayModels.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(displayModels.ownerId, ownerId), eq(displayModels.id, id), eq(displayModels.status, 'ready'), isNull(displayModels.deletedAt), eq(displayModels.revision, revision)))
        .returning({ id: displayModels.id })
      if (rows.length === 0) {
        await requireLiveModel(ownerId, id)
        throw createConflictError('The display model changed on another device')
      }
    },
  }
}

export type DisplayModelService = ReturnType<typeof createDisplayModelService>

export function parseDisplayModelInput<TOutput>(schema: v.BaseSchema<unknown, TOutput, v.BaseIssue<unknown>>, input: unknown) {
  const result = v.safeParse(schema, input)
  if (!result.success)
    throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
  return result.output
}
