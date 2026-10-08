import type { Database } from '../../libs/db'
import type { UploadSession } from '../../schemas/display-models'
import type { ObjectStore } from '../adapters/object-store'

import { Buffer } from 'node:buffer'

import { and, eq, gt, ne, sql } from 'drizzle-orm'

import { uploadSessions } from '../../schemas/display-models'
import { ApiError, createConflictError } from '../../utils/error'
import { nanoid } from '../../utils/id'

/** Database handle or open transaction. */
export type DatabaseExecutor = Pick<Database, 'select' | 'insert' | 'update' | 'execute'>

/** Lifetime of a reservation. Signed URLs are re-issued on replay and expire sooner. */
const SESSION_TTL_MS = 60 * 60 * 1000

export interface ReserveUploadInput {
  ownerId: string
  /** Business purpose chosen by the server route, for example `display-model`. */
  purpose: string
  /** The business record that the upload belongs to. */
  subjectId: string
  /** Client idempotency key. A retry with the same key returns the same session. */
  requestId: string
  contentType: string
  size: number
  /** Lowercase hex SHA-256 of the full body. */
  sha256: string
  /** Builds the object key. The client never chooses it. */
  keyFor: (uploadId: string) => string
}

export interface VerifyUploadOptions {
  /** Required leading bytes of the object, for format signature checks. */
  signature?: Buffer
}

function hexToBase64(hex: string) {
  return Buffer.from(hex, 'hex').toString('base64')
}

function isMissingObject(error: unknown) {
  return typeof error === 'object' && error !== null && '$metadata' in error
    && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
}

/**
 * Generic direct-upload sessions over the shared object store.
 *
 * Use when:
 * - A business domain needs the client to upload bytes straight to object storage.
 *
 * Expects:
 * - The domain authorizes the owner and decides what the bytes mean. Sessions only prove that
 *   the expected bytes arrived at a server-chosen key.
 *
 * Returns:
 * - Methods that accept a database executor, so a domain can reserve quota and a session in one transaction.
 */
export function createUploadSessionService(objectStore: ObjectStore) {
  return {
    /** Serializes quota decisions for one owner. Call first inside a transaction. */
    async lockOwner(executor: DatabaseExecutor, ownerId: string) {
      await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${ownerId}))`)
    },

    async findByRequest(executor: DatabaseExecutor, ownerId: string, purpose: string, requestId: string) {
      const [session] = await executor.select().from(uploadSessions).where(and(
        eq(uploadSessions.ownerId, ownerId),
        eq(uploadSessions.purpose, purpose),
        eq(uploadSessions.requestId, requestId),
      ))
      return session
    },

    async findOwned(executor: DatabaseExecutor, ownerId: string, uploadId: string) {
      const [session] = await executor.select().from(uploadSessions).where(and(
        eq(uploadSessions.ownerId, ownerId),
        eq(uploadSessions.id, uploadId),
      ))
      return session
    },

    /** Sums bytes that unexpired pending sessions of this purpose reserve, except for one subject. */
    async reservedBytes(executor: DatabaseExecutor, ownerId: string, purpose: string, exceptSubjectId: string) {
      const [row] = await executor
        .select({ total: sql<number>`coalesce(sum(${uploadSessions.expectedSize}), 0)::float8` })
        .from(uploadSessions)
        .where(and(
          eq(uploadSessions.ownerId, ownerId),
          eq(uploadSessions.purpose, purpose),
          eq(uploadSessions.status, 'pending'),
          gt(uploadSessions.expiresAt, new Date()),
          ne(uploadSessions.subjectId, exceptSubjectId),
        ))
      return row.total
    },

    async reserve(executor: DatabaseExecutor, input: ReserveUploadInput) {
      const id = nanoid()
      const [session] = await executor.insert(uploadSessions).values({
        id,
        ownerId: input.ownerId,
        purpose: input.purpose,
        subjectId: input.subjectId,
        requestId: input.requestId,
        objectKey: input.keyFor(id),
        contentType: input.contentType,
        expectedSize: input.size,
        expectedSha256: input.sha256,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      }).returning()
      return session
    },

    /** Signs a write-once PUT. The store rejects wrong bytes and existing keys. */
    async createTarget(session: UploadSession) {
      const target = await objectStore.createUploadTarget({
        Key: session.objectKey,
        ContentType: session.contentType,
        ChecksumSHA256: hexToBase64(session.expectedSha256),
        IfNoneMatch: '*',
      })
      return { uploadId: session.id, method: 'PUT' as const, url: target.url, headers: target.headers, expiresAt: session.expiresAt }
    },

    /**
     * Confirms the object has the expected size, store-validated SHA-256, and signature.
     * A missing object returns a retryable conflict. Wrong bytes remove the object and abort the session.
     */
    async verify(executor: DatabaseExecutor, session: UploadSession, options: VerifyUploadOptions = {}) {
      if (session.expiresAt.getTime() < Date.now())
        throw new ApiError(410, 'UPLOAD_EXPIRED', 'The upload session expired')

      let head
      try {
        head = await objectStore.inspectObject(session.objectKey)
      }
      catch (error) {
        if (isMissingObject(error))
          throw createConflictError('The upload has not reached storage yet')
        throw error
      }

      let problem: string | undefined
      if (head.ContentLength !== session.expectedSize) {
        problem = 'The uploaded size does not match'
      }
      else if (head.ChecksumSHA256 !== hexToBase64(session.expectedSha256)) {
        problem = 'The uploaded checksum does not match'
      }
      else if (options.signature) {
        const body = (await objectStore.getObject(session.objectKey, `bytes=0-${options.signature.length - 1}`)).Body
        const head4 = body ? Buffer.from(await body.transformToByteArray()) : Buffer.alloc(0)
        if (!head4.subarray(0, options.signature.length).equals(options.signature))
          problem = 'The uploaded file has the wrong format'
      }

      if (problem) {
        await executor.update(uploadSessions).set({ status: 'aborted' }).where(eq(uploadSessions.id, session.id))
        await objectStore.deleteObject(session.objectKey)
        throw new ApiError(422, 'UPLOAD_VERIFICATION_FAILED', problem)
      }
    },

    /** Marks a pending session completed. Returns false if another request already did. */
    async markCompleted(executor: DatabaseExecutor, uploadId: string) {
      const rows = await executor.update(uploadSessions)
        .set({ status: 'completed', completedAt: new Date() })
        .where(and(eq(uploadSessions.id, uploadId), eq(uploadSessions.status, 'pending')))
        .returning({ id: uploadSessions.id })
      return rows.length > 0
    },
  }
}

export type UploadSessionService = ReturnType<typeof createUploadSessionService>
