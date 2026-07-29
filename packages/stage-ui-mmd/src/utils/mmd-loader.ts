import type { MMD } from '@moeru/three-mmd'
import type { LoadingManager, SkinnedMesh } from 'three'

import type { MMDLoadedAssets, MMDModelFormat } from './mmd-zip-loader'

import { createMMDLoaderContext, loadMMD } from '../composables/mmd/loader'
import { prepareMMDMaterials } from './mmd-materials'
import { loadMMDZip } from './mmd-zip-loader'

export interface ResolvedMMDModel {
  /** MMD runtime that owns IK, grant, morph, and optional physics state. */
  mmd: MMD
  /** Convenience alias for `mmd.mesh`. */
  mesh: SkinnedMesh
  format: MMDModelFormat
  /** Present only when the source was a ZIP archive. */
  assets?: MMDLoadedAssets
  /** Revokes any blob URLs created while resolving the model. */
  dispose: () => void
}

export interface LoadMMDOptions {
  /**
   * Wait for the model's textures to finish loading before resolving.
   *
   * MMDLoader resolves the mesh as soon as it is parsed; textures continue
   * loading through the LoadingManager. The live scene renders continuously so
   * textures appear within a frame or two, but a one-shot offscreen render
   * (the preview) would capture an untextured/transparent frame. Enable this
   * for previews. Defaults to `false`.
   */
  waitForTextures?: boolean
}

// ZIP local-file-header magic: "PK\x03\x04".
function isZip(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  return head[0] === 0x50 && head[1] === 0x4B && head[2] === 0x03 && head[3] === 0x04
}

/**
 * Resolves once the manager has no more pending loads.
 *
 * `LoadingManager.onLoad` fires when the last queued item finishes. A timeout
 * guards the case where everything is already loaded (so `onLoad` never fires)
 * or a texture stalls, so preview generation can never hang.
 */
function waitForManagerIdle(manager: LoadingManager, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = () => {
      if (settled)
        return
      settled = true
      clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(finish, timeoutMs)
    manager.onLoad = finish
  })
}

function formatFromUrl(url: string): MMDModelFormat {
  return url.split(/[?#]/)[0].toLowerCase().endsWith('.pmd') ? 'pmd' : 'pmx'
}

/**
 * Loads an MMD model from an arbitrary source URL with its runtime intact.
 *
 * Accepts either a packaged ZIP (the usual distribution form: model plus
 * textures) or a bare `.pmx`/`.pmd` URL. ZIP archives are unpacked to blob
 * URLs and a basename-based texture resolver is installed on the loader; raw
 * URLs are loaded directly and rely on the server's relative paths.
 *
 * The returned `dispose()` revokes any blob URLs created during the load. It
 * does not dispose the mesh's GPU resources — the scene owns that lifecycle.
 */
export async function loadMMDModelFromSource(src: string, options: LoadMMDOptions = {}): Promise<ResolvedMMDModel> {
  const response = await fetch(src)
  if (!response.ok)
    throw new Error(`Failed to fetch MMD model: ${response.status} ${response.statusText}`)

  const buffer = await response.arrayBuffer()

  if (isZip(buffer)) {
    const assets = await loadMMDZip(buffer)
    let mmd: MMD | undefined
    try {
      const { loader, manager } = createMMDLoaderContext(assets.urlModifier)
      mmd = await loadMMD(loader, assets.modelBlobUrl)
      prepareMMDMaterials(mmd.mesh)
      if (options.waitForTextures)
        await waitForManagerIdle(manager)
      return {
        mmd,
        mesh: mmd.mesh,
        format: assets.variant.format,
        assets,
        dispose: () => assets.dispose(),
      }
    }
    catch (error) {
      // Runtime state must end before ZIP-owned blob URLs disappear; material
      // texture requests can still refer to those URLs while loading fails.
      mmd?.dispose()
      assets.dispose()
      throw error
    }
  }

  // Raw model URL: load directly, textures resolve against the server path.
  const { loader, manager } = createMMDLoaderContext()
  const mmd = await loadMMD(loader, src)
  prepareMMDMaterials(mmd.mesh)
  if (options.waitForTextures)
    await waitForManagerIdle(manager)
  return {
    mmd,
    mesh: mmd.mesh,
    format: formatFromUrl(src),
    dispose: () => {},
  }
}
