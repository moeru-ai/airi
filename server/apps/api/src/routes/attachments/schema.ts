import * as v from 'valibot'

export const CreateAttachmentSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[\w-]{1,128}$/)),
  mimeType: v.picklist(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  size: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3 * 1024 * 1024)),
})
