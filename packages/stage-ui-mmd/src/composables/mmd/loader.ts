import type { MMD } from '@moeru/three-mmd'
import type { AnimationClip, SkinnedMesh } from 'three'

import { buildAnimation, MMDLoader, VMDLoader } from '@moeru/three-mmd'
import { LoadingManager } from 'three'

/** Maps in-archive relative asset paths to blob URLs for ZIP-loaded models. */
export type UrlModifier = (url: string) => string

export interface MMDLoaderContext {
  loader: MMDLoader
  manager: LoadingManager
}

/**
 * Builds an {@link MMDLoader} backed by a dedicated {@link LoadingManager}.
 *
 * MMD models reference their textures (and toon ramps) by relative paths
 * baked into the PMX/PMD binary. For ZIP imports those files live behind blob
 * URLs, so we install a URL modifier on the manager: the loader asks for
 * `tex/face.png`, the modifier rewrites it to the matching `blob:` URL. For
 * plain URL/preset models the modifier passes paths through unchanged.
 *
 * A fresh manager per load keeps URL-rewrite tables isolated between models.
 */
export function createMMDLoaderContext(urlModifier?: UrlModifier): MMDLoaderContext {
  const manager = new LoadingManager()
  if (urlModifier) {
    manager.setURLModifier((url) => {
      // NOTICE:
      // MMDLoader resolves textures by prepending the model URL's base, so for
      // ZIP imports the texture requests arrive blob-prefixed
      // (e.g. "blob:http://host/uuid/tex/face.png"). We must still run those
      // through the resolver — an earlier `blob:` short-circuit here silently
      // broke all ZIP textures. Only data: URIs (embedded toon textures) are
      // passed through untouched. The resolver falls back to the original URL
      // for the model file and any unmatched path, so this is safe.
      if (url.startsWith('data:'))
        return url
      return urlModifier(url)
    })
  }

  return { loader: new MMDLoader(manager), manager }
}

/** Loads a PMX/PMD model URL while retaining its MMD runtime. */
export function loadMMD(
  loader: MMDLoader,
  url: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<MMD> {
  return loader.loadAsync(url, onProgress)
}

/**
 * Parses a VMD model motion and binds its bone and morph tracks to `mesh`.
 * AIRI intentionally does not consume camera motion from this adapter.
 */
export async function loadMMDAnimationClip(
  url: string,
  mesh: SkinnedMesh,
  onProgress?: (event: ProgressEvent) => void,
): Promise<AnimationClip> {
  const vmd = await new VMDLoader().loadAsync(url, onProgress)
  return buildAnimation(vmd, mesh)
}
