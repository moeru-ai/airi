import type { ObjectStore } from '../adapters/object-store'

import { Buffer } from 'node:buffer'

export function signWriteOnceUpload(store: Pick<ObjectStore, 'createUploadTarget'>, objectKey: string, contentType: string, sha256: string) {
  return store.createUploadTarget({
    Key: objectKey,
    ContentType: contentType,
    ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
    IfNoneMatch: '*',
  })
}

export function uploadedObjectMismatch(
  object: Awaited<ReturnType<ObjectStore['inspectObject']>>,
  expectedSize: number,
  expectedSha256: string,
  expectedContentType?: string,
) {
  if (object.ContentLength !== expectedSize)
    return 'The uploaded size does not match'
  if (object.ChecksumSHA256 !== Buffer.from(expectedSha256, 'hex').toString('base64'))
    return 'The uploaded checksum does not match'
  if (expectedContentType !== undefined && object.ContentType !== expectedContentType)
    return 'The uploaded content type does not match'
}
