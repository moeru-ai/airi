import type { MotionMetadata } from '@proj-airi/stage-ui-three/motions'

import localforage from 'localforage'

import { createMotionCatalog } from '@proj-airi/stage-ui-three/motions'

import * as v from 'valibot'

import { MotionImportError, readMotionAnimation } from './import'

const metadataStore = localforage.createInstance({ name: 'airi-vrm-motions', storeName: 'metadata' })
const assetStore = localforage.createInstance({ name: 'airi-vrm-motions', storeName: 'assets' })
const preferenceStore = localforage.createInstance({ name: 'airi-vrm-motions', storeName: 'preferences' })

const metadataSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^local-[a-z0-9-]+$/)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  category: v.picklist(['idle', 'gesture', 'dance', 'locomotion']),
  duration: v.pipe(v.number(), v.finite(), v.minValue(0.001), v.maxValue(600)),
  loop: v.boolean(),
  source: v.literal('imported'),
})
const preferenceSchema = v.object({
  idleId: v.pipe(v.string(), v.maxLength(100)),
  aiEnabled: v.boolean(),
  aiMotionIds: v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(32)),
})

/** Saved choices belong to one stable avatar identity, independent of temporary model URLs. */
export type MotionPreferences = v.InferOutput<typeof preferenceSchema>

export const relaxedIdle: MotionMetadata = {
  id: 'relaxed-idle',
  name: 'Relaxed arms idle',
  category: 'idle',
  duration: 48,
  loop: true,
  source: 'builtin',
}
export const builtinMotions: readonly MotionMetadata[] = [...createMotionCatalog().list(), relaxedIdle]

/** Returns fresh preference arrays so different avatars never share mutable selection state. */
export function defaultMotionPreferences(): MotionPreferences {
  return {
    idleId: 'default-idle',
    aiEnabled: true,
    aiMotionIds: builtinMotions.filter(entry => entry.category !== 'idle').map(entry => entry.id).slice(0, 32),
  }
}

/** Metadata reads never fetch motion blobs, even for large libraries. */
export async function listImportedMotions(): Promise<MotionMetadata[]> {
  const entries: MotionMetadata[] = []
  await metadataStore.iterate<unknown, void>((value) => {
    const parsed = v.safeParse(metadataSchema, value)
    if (parsed.success)
      entries.push(parsed.output)
  })
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

/** Stores the asset before its catalog entry so readers never discover an incomplete import. */
export async function importMotion(file: File): Promise<MotionMetadata> {
  if (!file.name.toLowerCase().endsWith('.vrma'))
    throw new MotionImportError('format')
  if (file.size === 0 || file.size > 16 * 1024 * 1024)
    throw new MotionImportError('size')
  const bytes = await file.arrayBuffer()
  const animation = await readMotionAnimation(bytes)
  const entry = v.parse(metadataSchema, {
    id: `local-${crypto.randomUUID()}`,
    name: file.name.replace(/\.vrma$/i, '').slice(0, 80),
    category: 'gesture',
    duration: animation.duration,
    loop: false,
    source: 'imported',
  })
  await assetStore.setItem(entry.id, bytes)
  try {
    await metadataStore.setItem(entry.id, entry)
  }
  catch (error) {
    await assetStore.removeItem(entry.id)
    throw error
  }
  return entry
}

export async function readMotionBytes(id: string): Promise<ArrayBuffer> {
  const bytes = await assetStore.getItem<ArrayBuffer>(id)
  if (!bytes)
    throw new MotionImportError('missing')
  return bytes
}

export async function removeMotion(id: string): Promise<void> {
  if (!id.startsWith('local-'))
    return
  await metadataStore.removeItem(id)
  await assetStore.removeItem(id)
}

export async function readMotionPreferences(modelId: string): Promise<MotionPreferences> {
  const parsed = v.safeParse(preferenceSchema, await preferenceStore.getItem(modelId))
  return parsed.success ? parsed.output : defaultMotionPreferences()
}

/** Each complete preference update commits under a per-avatar lock across renderer windows. */
export async function updateMotionPreferences(modelId: string, patch: Partial<MotionPreferences>): Promise<MotionPreferences> {
  return navigator.locks.request(`airi:vrm-motion:${modelId}`, async () => {
    const preferences = v.parse(preferenceSchema, { ...await readMotionPreferences(modelId), ...patch })
    await preferenceStore.setItem(modelId, preferences)
    return preferences
  })
}

/** Restricts model output to explicit, bounded catalog IDs instead of URLs or executable motion instructions. */
export function createMotionPrompt(preferences: MotionPreferences, entries: readonly MotionMetadata[]): string {
  if (!preferences.aiEnabled)
    return ''
  const allowed = new Set(preferences.aiMotionIds)
  const motions = entries.filter(entry => allowed.has(entry.id)).slice(0, 32)
  if (!motions.length)
    return ''
  return [
    'The VRM avatar supports these body motions. Choose only an ID from this list.',
    JSON.stringify(motions.map(({ id, name }) => ({ id, name }))),
    'Use <|ACT {"motion":"ID"}|> with normal conversation. Use "stop" to return to idle.',
    'Use motions sparingly. Motions end automatically. Do not invent IDs, URLs, or code.',
  ].join('\n')
}
