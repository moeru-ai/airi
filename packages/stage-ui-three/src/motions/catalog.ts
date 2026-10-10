import type { VRMCore } from '@pixiv/three-vrm-core'

import type { MotionLoader, MotionMetadata } from './types'

interface CatalogEntry {
  metadata: Readonly<MotionMetadata>
  load: MotionLoader
  revision: number
}

/** Owns metadata and lazy loaders. It never retains avatar-specific clips or rigs. */
export class MotionCatalog {
  private readonly entries = new Map<string, CatalogEntry>()
  private revision = 0

  /** Replacing an entry invalidates its cached clips on the next request. */
  register(metadata: MotionMetadata, load: MotionLoader) {
    if (!metadata.id.trim() || !Number.isFinite(metadata.duration) || metadata.duration <= 0)
      throw new Error('A motion needs an ID and a positive duration.')

    this.entries.set(metadata.id, {
      metadata: Object.freeze({ ...metadata, tags: metadata.tags && Object.freeze([...metadata.tags]) }),
      load,
      revision: ++this.revision,
    })
  }

  unregister(id: string) {
    this.entries.delete(id)
  }

  get(id: string) {
    return this.entries.get(id)?.metadata
  }

  list() {
    return [...this.entries.values()].map(entry => entry.metadata)
  }

  /** Controllers compare revisions after async loads to reject replaced entries. */
  getRevision(id: string) {
    return this.entries.get(id)?.revision
  }

  async load(id: string, vrm: VRMCore, signal: AbortSignal) {
    const entry = this.entries.get(id)
    if (!entry)
      throw new Error(`Motion "${id}" is not registered.`)
    signal.throwIfAborted()
    const result = entry.load(vrm, signal)
    signal.throwIfAborted()
    let onAbort: (() => void) | undefined
    try {
      const canceled = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
      })
      // Some asset loaders cannot cancel their transport. Their late result still cannot retain the caller's pending request.
      const clip = await Promise.race([result, canceled])
      signal.throwIfAborted()
      return clip
    }
    finally {
      if (onAbort)
        signal.removeEventListener('abort', onAbort)
    }
  }
}

/** Original, model-free motions. Only a selected motion builds its bone tracks. */
export const builtinMotionMetadata: readonly Readonly<MotionMetadata>[] = Object.freeze([
  { id: 'natural-idle', name: 'Natural idle', category: 'idle', duration: 6, loop: true, source: 'builtin', description: 'Relaxed arms, slow breathing, and a small weight shift.', tags: ['calm', 'standing'] },
  { id: 'bow', name: 'Bow', category: 'gesture', duration: 2.8, loop: false, source: 'builtin', description: 'A measured bow with both feet on the ground.', tags: ['greeting', 'thanks'] },
  { id: 'dance', name: 'Dance', category: 'dance', duration: 3.2, loop: true, source: 'builtin', description: 'A planted groove with knee bends and alternating arm swings.', tags: ['happy', 'rhythm'] },
  { id: 'run-circle', name: 'Run in a circle', category: 'locomotion', duration: 0.72, loop: true, source: 'builtin', rootMotion: 'circle', description: 'A running gait on a small circular path.', tags: ['run', 'active'] },
  { id: 'wave', name: 'Wave', category: 'gesture', duration: 2.6, loop: false, source: 'builtin', description: 'Raise one hand and wave hello.', tags: ['greeting'] },
  { id: 'nod', name: 'Nod', category: 'gesture', duration: 1.8, loop: false, source: 'builtin', description: 'Two gentle nods.', tags: ['yes', 'agreement'] },
  { id: 'shake-head', name: 'Shake head', category: 'gesture', duration: 1.8, loop: false, source: 'builtin', description: 'A small side-to-side head gesture.', tags: ['no'] },
  { id: 'celebrate', name: 'Celebrate', category: 'gesture', duration: 2.8, loop: false, source: 'builtin', description: 'Raise both arms with a soft knee bounce.', tags: ['happy', 'success'] },
  { id: 'stretch', name: 'Stretch', category: 'gesture', duration: 4, loop: false, source: 'builtin', description: 'An overhead stretch with a gentle side bend.', tags: ['relax'] },
  { id: 'present', name: 'Present', category: 'gesture', duration: 3, loop: false, source: 'builtin', description: 'Open one arm toward the side.', tags: ['explain', 'welcome'] },
] satisfies MotionMetadata[])

/** Creates an independent registry. Procedural track code loads only when a motion is selected. */
export function createMotionCatalog() {
  const catalog = new MotionCatalog()
  for (const metadata of builtinMotionMetadata) {
    catalog.register(metadata, async (vrm, signal) => {
      const { createProceduralClip } = await import('./procedural')
      signal.throwIfAborted()
      return createProceduralClip(vrm, metadata.id, metadata.duration)
    })
  }
  return catalog
}
