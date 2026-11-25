import type { NormalAttachment } from './attachment'

import JSZip from 'jszip'

import * as v from 'valibot'

const finite = v.pipe(v.number(), v.finite())
const index = v.pipe(finite, v.integer(), v.minValue(0))
const point = v.tuple([finite, finite])
const radius = v.tuple([v.pipe(finite, v.minValue(Number.EPSILON)), v.pipe(finite, v.minValue(Number.EPSILON))])
const filename = v.pipe(v.string(), v.regex(/^[\w-]+\.png$/))
const profileSchema = v.object({
  schema: v.literal(1),
  fingerprint: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  createdAt: index,
  generator: v.object({ model: v.string(), revision: v.string(), steps: index, seed: finite, seconds: v.pipe(finite, v.minValue(0)), device: v.string() }),
  width: v.pipe(index, v.minValue(1), v.maxValue(2048)),
  height: v.pipe(index, v.minValue(1), v.maxValue(2048)),
  space: v.literal('x-right-y-up-z-viewer'),
  coveredPixels: index,
  drawables: v.pipe(v.array(v.object({
    id: v.string(),
    reference: v.array(finite),
    atlasUvs: v.array(finite),
    indices: v.array(index),
    texture: index,
  })), v.minLength(1)),
  faceSurface: v.optional(v.object({
    center: point,
    radius,
    drawables: v.array(index),
    yaw: v.optional(v.object({ parameter: v.string(), range: v.pipe(finite, v.minValue(Number.EPSILON)) })),
    nose: v.optional(v.object({ drawable: index, center: point, radius, strength: v.pipe(finite, v.minValue(0), v.maxValue(1)) })),
    illustrated: v.optional(v.object({ face: index, hair: v.array(index), shadowCasters: v.array(index) })),
  })),
  neutral: filename,
  normal: filename,
  rawNormal: v.optional(filename),
  ownership: filename,
  coverage: filename,
})

/**
 * Reads a standalone lighting ZIP. Image names resolve only inside the archive.
 * No model files, absolute paths, or IndexedDB state are required. The caller must
 * still match the fingerprint and validate topology against the active model.
 */
export async function importNormalBundle(file: Blob): Promise<NormalAttachment> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const manifest = zip.file('profile.json')
  if (!manifest)
    throw new Error('The lighting ZIP must contain profile.json at its root.')
  const profile = v.parse(profileSchema, JSON.parse(await manifest.async('string')))
  async function image(name: string) {
    const entry = zip.file(name)
    if (!entry)
      throw new Error(`The lighting ZIP is missing ${name}.`)
    const blob = new Blob([await entry.async('arraybuffer')], { type: 'image/png' })
    const bitmap = await createImageBitmap(blob)
    try {
      if (bitmap.width !== profile.width || bitmap.height !== profile.height)
        throw new Error(`The image ${name} does not match the profile dimensions.`)
    }
    finally { bitmap.close() }
    return blob
  }
  const [neutral, normal, ownership, coverage, rawNormal] = await Promise.all([
    image(profile.neutral),
    image(profile.normal),
    image(profile.ownership),
    image(profile.coverage),
    profile.rawNormal ? image(profile.rawNormal) : undefined,
  ])
  return { ...profile, neutral, normal, ownership, coverage, rawNormal }
}

/** Exports every image and reviewed binding together, without the source model. */
export async function exportNormalBundle(attachment: NormalAttachment): Promise<Blob> {
  const { neutral, normal, rawNormal, ownership, coverage, ...metadata } = attachment
  const profile = v.parse(profileSchema, {
    ...metadata,
    neutral: 'neutral.png',
    normal: 'normal.png',
    ownership: 'ownership.png',
    coverage: 'coverage.png',
    rawNormal: rawNormal ? 'raw-normal.png' : undefined,
  })
  const zip = new JSZip()
  zip.file('profile.json', JSON.stringify(profile))
  for (const [name, blob] of [['neutral.png', neutral], ['normal.png', normal], ['ownership.png', ownership], ['coverage.png', coverage], ['raw-normal.png', rawNormal]] as const) {
    if (blob)
      zip.file(name, await blob.arrayBuffer())
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
