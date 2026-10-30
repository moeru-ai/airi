import type { Cubism4InternalModel } from 'pixi-live2d-display/cubism4'

import localforage from 'localforage'

/** A drawable's neutral image coordinates, independent of the desktop viewport. */
export interface NormalDrawable {
  id: string
  reference: number[]
  atlasUvs: number[]
  indices: number[]
  texture: number
}

export interface NormalCapture {
  fingerprint: string
  width: number
  height: number
  neutral: Blob
  ownership: Blob
  coverage: Blob
  coveredPixels: number
  drawables: NormalDrawable[]
}

/** A reviewed facial surface shared by paint layers, in neutral image coordinates. */
export interface ReviewedFaceSurface {
  center: [number, number]
  radius: [number, number]
  /** Optional rig parameter and positive endpoint used to rotate facial normals. */
  yaw?: { parameter: string, range: number }
  /** A reviewed painted nose mesh; omit when the rig has no distinct nose. */
  nose?: { drawable: number, center: [number, number], radius: [number, number], strength: number }
  /** Reviewed indices belong only to this fingerprinted rig. */
  drawables: number[]
  /** Reviewed material ownership enables illustrated shading and optional hair shadows. */
  illustrated?: { face: number, hair: number[], shadowCasters: number[] }
}

/** Generated data belongs to the source assets, never to a mutable filename or ZIP encoding. */
export interface NormalAttachment {
  schema: 1
  fingerprint: string
  createdAt: number
  generator: { model: string, revision: string, steps: number, seed: number, seconds: number, device: string }
  width: number
  height: number
  space: 'x-right-y-up-z-viewer'
  drawables: NormalDrawable[]
  neutral: Blob
  normal: Blob
  rawNormal?: Blob
  faceSurface?: ReviewedFaceSurface
  ownership: Blob
  coverage: Blob
  coveredPixels: number
}

// One IndexedDB value contains the whole attachment. Failed replacement writes
// cannot leave a new profile pointing at old image data. No model files change.
const attachments = localforage.createInstance({ name: 'airi-live2d-lighting', storeName: 'attachments' })

/** Returns only complete attachments with the schema understood by this renderer. */
export async function readNormalAttachment(fingerprint: string) {
  const value = await attachments.getItem<NormalAttachment>(fingerprint)
  if (!value)
    return undefined
  if (value.schema !== 1 || value.fingerprint !== fingerprint)
    throw new Error('The saved normal attachment has an unsupported schema or model fingerprint.')
  return value
}

/** Atomically replaces the model's generated attachment after image and binding validation. */
export async function saveNormalAttachment(attachment: NormalAttachment) {
  await attachments.setItem(attachment.fingerprint, attachment)
}

/** Hashes the rig and ordered texture contents, so renamed/repacked models share lighting. */
export async function fingerprintModel(model: Cubism4InternalModel) {
  const paths = [model.settings.moc, ...model.settings.textures]
  const hashes = await Promise.all(paths.map(async (path) => {
    const response = await fetch(model.settings.resolveURL(path))
    if (!response.ok)
      throw new Error(`Could not read a model asset for its lighting fingerprint: ${response.status}`)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))
  }))
  // Each digest has a fixed length; texture order defines its drawable slot.
  const content = new Uint8Array(hashes.length * 32)
  hashes.forEach((hash, i) => content.set(hash, i * 32))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Rejects mismatched topology before a saved map can enter the live drawable shader. */
export function validateNormalBinding(model: Cubism4InternalModel, attachment: NormalAttachment) {
  const core = model.coreModel
  const ids = core.getDrawableIds()
  if (attachment.schema !== 1 || attachment.space !== 'x-right-y-up-z-viewer'
    || attachment.width < 1 || attachment.width > 2048 || attachment.height < 1 || attachment.height > 2048
    || ids.length !== attachment.drawables.length) {
    throw new Error('The normal attachment does not match this Live2D model.')
  }
  const face = attachment.faceSurface
  if (face && (face.center.length !== 2 || face.radius.length !== 2
    || !face.center.every(Number.isFinite) || !face.radius.every(value => Number.isFinite(value) && value > 0)
    || !face.drawables.every(index => Number.isInteger(index) && index >= 0 && index < ids.length))) {
    throw new Error('The reviewed face surface has invalid geometry or drawable indices.')
  }
  if (face?.yaw && (!core.getModel().parameters.ids.includes(face.yaw.parameter) || !Number.isFinite(face.yaw.range) || face.yaw.range <= 0))
    throw new Error('The reviewed face yaw does not match a rig parameter.')
  const illustrated = face?.illustrated
  if (illustrated && (!face.drawables.includes(illustrated.face)
    || ![...illustrated.hair, ...illustrated.shadowCasters].every(index => Number.isInteger(index) && index >= 0 && index < ids.length)
    || illustrated.shadowCasters.some(index => core.getDrawableMaskCounts()[index] !== 0))) {
    throw new Error('The illustrated material binding does not match this model.')
  }
  const nose = face?.nose
  if (nose && (!Number.isInteger(nose.drawable) || !face.drawables.includes(nose.drawable)
    || nose.center.length !== 2 || nose.radius.length !== 2 || !nose.center.every(Number.isFinite)
    || !nose.radius.every(value => Number.isFinite(value) && value > 0)
    || !Number.isFinite(nose.strength) || nose.strength < 0 || nose.strength > 1)) {
    throw new Error('The reviewed nose has invalid geometry or drawable ownership.')
  }
  for (let i = 0; i < ids.length; i++) {
    const entry = attachment.drawables[i]
    const uvs = core.getDrawableVertexUvs(i)
    const indices = core.getDrawableVertexIndices(i)
    if (entry.id !== ids[i] || entry.texture !== core.getDrawableTextureIndices(i)
      || entry.reference.length !== uvs.length || entry.atlasUvs.length !== uvs.length
      || entry.indices.length !== indices.length || !entry.reference.every(Number.isFinite)
      || !uvs.every((v, k) => v === Math.fround(entry.atlasUvs[k]))
      || !indices.every((v, k) => v === entry.indices[k])) {
      throw new Error(`The normal binding does not match drawable ${ids[i]}.`)
    }
  }
}
