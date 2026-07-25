import type { AnimationClip, SkinnedMesh } from 'three'

import { LoadingManager } from 'three'
import { MMDLoader } from 'three-stdlib'

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

/** Loads a PMX/PMD model URL into a {@link SkinnedMesh}. */
export function loadMMDMesh(
  loader: MMDLoader,
  url: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<SkinnedMesh> {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, onProgress, reject)
  })
}

/**
 * Loads a VMD motion file and binds it to `mesh`, producing an
 * {@link AnimationClip} ready for the mesh's `AnimationMixer`.
 *
 * `loadAnimation` may hand back either a clip or (for camera motions) a mesh;
 * AIRI only consumes model motions, so a non-clip result is rejected.
 */
export function loadMMDAnimationClip(
  loader: MMDLoader,
  url: string,
  mesh: SkinnedMesh,
  onProgress?: (event: ProgressEvent) => void,
): Promise<AnimationClip> {
  return new Promise((resolve, reject) => {
    loader.loadAnimation(
      url,
      mesh,
      (result) => {
        // A bound model motion resolves to an AnimationClip (has `.tracks`).
        if (result && 'tracks' in result)
          resolve(result as AnimationClip)
        else
          reject(new Error('Loaded VMD did not produce a model animation clip'))
      },
      onProgress,
      reject,
    )
  })
}
