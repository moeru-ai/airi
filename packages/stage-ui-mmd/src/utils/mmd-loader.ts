import type { Color, Material, SkinnedMesh, Texture } from 'three'

import type { MMDLoadedAssets, MMDModelFormat } from './mmd-zip-loader'

import { Mesh, SRGBColorSpace } from 'three'

import { createMMDLoaderContext, loadMMDMesh } from '../composables/mmd/loader'
import { loadMMDZip } from './mmd-zip-loader'

export interface ResolvedMMDModel {
  mesh: SkinnedMesh
  format: MMDModelFormat
  /** Present only when the source was a ZIP archive. */
  assets?: MMDLoadedAssets
  /** Revokes any blob URLs created while resolving the model. */
  dispose: () => void
}

// ZIP local-file-header magic: "PK\x03\x04".
function isZip(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  return head[0] === 0x50 && head[1] === 0x4B && head[2] === 0x03 && head[3] === 0x04
}

/** Material with the slots we adjust for correct MMD shading under r184. */
type ColorMappedMaterial = Material & {
  map?: Texture | null
  emissiveMap?: Texture | null
  emissive?: Color
  emissiveIntensity?: number
  color?: Color
}

/** Fraction of the albedo fed back as self-illumination for the anime glow. */
const MMD_ALBEDO_GLOW = 0.45

/**
 * Corrects MMD materials for three r184 and gives them the flat, luminous
 * anime look, after load.
 *
 * Fixes:
 *
 * 1. Color space — three-stdlib's MMDLoader predates the
 *    `encoding` → `colorSpace` migration and assigns color textures without a
 *    color space, so under r184 they decode in linear space and read too
 *    bright/desaturated. We retag color maps as sRGB; data maps
 *    (normal/gradient/sphere) stay linear.
 *
 * 2. Baked ambient → albedo glow — MMDLoader maps each PMX material's ambient
 *    color (環境色, a strong grey) onto `material.emissive`, which washes the
 *    model out as a flat grey. MMD's actual look is a bright, slightly-shaded
 *    albedo with a soft self-glow. We replace the grey emissive with the
 *    material's own diffuse map (or color) at {@link MMD_ALBEDO_GLOW}
 *    intensity, so each surface self-illuminates in its own color — skin glows
 *    skin-colored — instead of grey.
 */
function fixupMMDMaterials(mesh: SkinnedMesh): void {
  mesh.traverse((object) => {
    if (!(object instanceof Mesh))
      return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      const mapped = material as ColorMappedMaterial

      if (mapped.map)
        mapped.map.colorSpace = SRGBColorSpace

      if (mapped.emissive) {
        if (mapped.map) {
          // Self-illuminate from the albedo: emissive = white × diffuse map.
          mapped.emissiveMap = mapped.map
          mapped.emissive.setScalar(1)
        }
        else if (mapped.color) {
          // No texture: glow in the flat diffuse color instead.
          mapped.emissive.copy(mapped.color)
        }
        else {
          mapped.emissive.setScalar(0)
        }
        if (typeof mapped.emissiveIntensity === 'number')
          mapped.emissiveIntensity = MMD_ALBEDO_GLOW
      }

      if (mapped.emissiveMap)
        mapped.emissiveMap.colorSpace = SRGBColorSpace

      material.needsUpdate = true
    }
  })
}

function formatFromUrl(url: string): MMDModelFormat {
  return url.split(/[?#]/)[0].toLowerCase().endsWith('.pmd') ? 'pmd' : 'pmx'
}

/**
 * Ensures a model URL ends with a `.pmx`/`.pmd` extension that
 * `MMDLoader` can sniff.
 *
 * MMDLoader chooses the PMX vs PMD parser purely from the URL's file
 * extension (`_extractExtension` → `lastIndexOf('.')`). Object/blob URLs from
 * `URL.createObjectURL` have no extension, so the loader throws "Unknown model
 * file extension". We append the known format as a URL fragment: the blob URL
 * store ignores the fragment when fetching the blob, but the extension sniff
 * reads it. URLs that already carry a real extension are returned unchanged.
 *
 * Before:
 * - "blob:http://host/9f1c-…" (format known to be pmx)
 *
 * After:
 * - "blob:http://host/9f1c-…#airi-model.pmx"
 */
export function withModelExtension(url: string, format: MMDModelFormat): string {
  const path = url.split(/[?#]/)[0].toLowerCase()
  if (path.endsWith('.pmx') || path.endsWith('.pmd'))
    return url
  return `${url}#airi-model.${format}`
}

/**
 * Loads an MMD model from an arbitrary source URL into a {@link SkinnedMesh}.
 *
 * Accepts either a packaged ZIP (the usual distribution form: model plus
 * textures) or a bare `.pmx`/`.pmd` URL. ZIP archives are unpacked to blob
 * URLs and a basename-based texture resolver is installed on the loader; raw
 * URLs are loaded directly and rely on the server's relative paths.
 *
 * The returned `dispose()` revokes any blob URLs created during the load. It
 * does not dispose the mesh's GPU resources — the scene owns that lifecycle.
 */
export async function loadMMDModelFromSource(src: string): Promise<ResolvedMMDModel> {
  const response = await fetch(src)
  if (!response.ok)
    throw new Error(`Failed to fetch MMD model: ${response.status} ${response.statusText}`)

  const buffer = await response.arrayBuffer()

  if (isZip(buffer)) {
    const assets = await loadMMDZip(buffer)
    const { loader } = createMMDLoaderContext(assets.urlModifier)
    const mesh = await loadMMDMesh(loader, withModelExtension(assets.modelBlobUrl, assets.variant.format))
    fixupMMDMaterials(mesh)
    return {
      mesh,
      format: assets.variant.format,
      assets,
      dispose: () => assets.dispose(),
    }
  }

  // Raw model URL: load directly, textures resolve against the server path.
  const { loader } = createMMDLoaderContext()
  const mesh = await loadMMDMesh(loader, withModelExtension(src, formatFromUrl(src)))
  fixupMMDMaterials(mesh)
  return {
    mesh,
    format: formatFromUrl(src),
    dispose: () => {},
  }
}
