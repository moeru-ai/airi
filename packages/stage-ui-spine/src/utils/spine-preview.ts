import { loadSpineRuntime } from './spine-runtime'
import { detectSpineVersionFromBinary, detectSpineVersionFromJson } from './spine-version'
import { loadSpineZip } from './spine-zip-loader'

/**
 * Renders the first frame of a user-imported Spine ZIP to an offscreen
 * canvas and returns a data URL suitable for the model-selector grid.
 *
 * Use when:
 * - A user imports a `.zip` Spine model and the display-models store
 *   needs a thumbnail for the catalog tile.
 *
 * Expects:
 * - The ZIP passes `validateSpineZip()`; otherwise this returns `undefined`.
 *
 * Returns:
 * - A `data:image/png` URL when rendering succeeds, otherwise `undefined`.
 */
export async function loadSpineModelPreview(file: File): Promise<string | undefined> {
  let assets: Awaited<ReturnType<typeof loadSpineZip>> | undefined
  let canvas: HTMLCanvasElement | undefined
  try {
    assets = await loadSpineZip(file)

    let detectedVersion = assets.layout.skeletonFormat === 'binary'
      ? detectSpineVersionFromBinary(assets.rawData[assets.layout.skeletonPath] as Uint8Array)
      : detectSpineVersionFromJson(assets.rawData[assets.layout.skeletonPath] as string)
    if (!detectedVersion)
      detectedVersion = '4.2'
    const spine = await loadSpineRuntime(detectedVersion)

    const previewWidth = 720
    const previewHeight = 960

    canvas = document.createElement('canvas')
    canvas.width = previewWidth
    canvas.height = previewHeight
    canvas.style.position = 'absolute'
    canvas.style.left = '-99999px'
    canvas.style.top = '0'
    document.body.appendChild(canvas)

    const layout = assets.layout
    const blobUrls = assets.blobUrls
    const rawData = assets.rawData

    const skeletonAssetPath = layout.skeletonPath
    const atlasAssetPath = layout.atlasPath

    return await new Promise<string | undefined>((resolve) => {
      let resolved = false
      const finish = (value: string | undefined) => {
        if (resolved)
          return
        resolved = true
        resolve(value)
      }

      try {
        const app: import('@esotericsoftware/spine-webgl').SpineCanvasApp = {
          loadAssets: (canvasApp: import('@esotericsoftware/spine-webgl').SpineCanvas) => {
            // NOTICE:
            // Patch BEFORE any load calls. SpineCanvas calls loadAssets
            // synchronously in its constructor, and load methods immediately
            // dispatch XHR. Patching after the constructor is too late.
            // Source/context: spine-core/AssetManagerBase.js Downloader class.
            // Removal condition: Spine ships a Blob/buffer-aware loader.
            const am = canvasApp.assetManager
            patchAssetManagerForZipAssets(am, blobUrls, rawData, layout.texturePaths)

            if (layout.skeletonFormat === 'binary')
              am.loadBinary(skeletonAssetPath)
            else
              am.loadJson(skeletonAssetPath)

            // loadTextureAtlas loads every page image referenced by the atlas
            // through the patched downloader, so the texture pages do not need
            // to be requested again individually.
            am.loadTextureAtlas(atlasAssetPath)
          },
          initialize: (canvasApp: import('@esotericsoftware/spine-webgl').SpineCanvas) => {
            const am = canvasApp.assetManager

            const atlas = am.require(atlasAssetPath) as import('@esotericsoftware/spine-webgl').TextureAtlas
            const skeletonData = layout.skeletonFormat === 'binary'
              ? new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas))
                  .readSkeletonData(am.require(skeletonAssetPath) as Uint8Array)
              : new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas))
                  .readSkeletonData(am.require(skeletonAssetPath) as string)

            const skeleton = new spine.Skeleton(skeletonData)
            skeleton.setToSetupPose()
            // Some rigs ship without a default skin; their slot attachments
            // only resolve once a skin is active, so setup pose renders empty.
            // Fall back to the first skin so the preview isn't blank.
            if (!skeletonData.defaultSkin && skeletonData.skins.length > 0) {
              skeleton.setSkinByName(skeletonData.skins[0].name)
              skeleton.setSlotsToSetupPose()
            }
            ;(canvasApp as unknown as { __previewSkeleton: import('@esotericsoftware/spine-webgl').Skeleton }).__previewSkeleton = skeleton
          },
          update: (canvasApp: import('@esotericsoftware/spine-webgl').SpineCanvas, _delta: number) => {
            const skeleton = (canvasApp as unknown as { __previewSkeleton?: import('@esotericsoftware/spine-webgl').Skeleton }).__previewSkeleton
            if (skeleton) {
              if (spine.Physics)
                skeleton.updateWorldTransform(spine.Physics.update)
              else
                (skeleton as any).updateWorldTransform()
            }
          },
          render: (canvasApp: import('@esotericsoftware/spine-webgl').SpineCanvas) => {
            const skeleton = (canvasApp as unknown as { __previewSkeleton?: import('@esotericsoftware/spine-webgl').Skeleton }).__previewSkeleton
            if (!skeleton)
              return

            const renderer = canvasApp.renderer
            // Expand keeps world units == canvas pixels at zoom 1, giving a
            // predictable basis for the bounds-fit math below.
            renderer.resize(spine.ResizeMode.Expand)

            // Frame the camera to the skeleton's world-space bounding box.
            // Most rigs anchor the root at the feet, so the model occupies
            // roughly y: 0..height around x: 0. The renderer's default camera
            // sits at the origin and would crop everything above the ankles —
            // this is the actual cause of the cropped preview. getBounds gives
            // the AABB of the currently posed attachments; we centre on it and
            // zoom so the whole box fits with a small margin.
            const offset = new spine.Vector2()
            const size = new spine.Vector2()
            skeleton.getBounds(offset, size, [])

            const camera = renderer.camera
            if (size.x > 0 && size.y > 0) {
              const padding = 1.1
              camera.position.x = offset.x + size.x / 2
              camera.position.y = offset.y + size.y / 2
              camera.zoom = Math.max(size.x / camera.viewportWidth, size.y / camera.viewportHeight) * padding
              camera.update()
            }

            canvasApp.gl.clearColor(0, 0, 0, 0)
            canvasApp.gl.clear(canvasApp.gl.COLOR_BUFFER_BIT)
            renderer.begin()
            renderer.drawSkeleton(skeleton, true)
            renderer.end()

            // Wait for a valid bounding box before capturing. A degenerate box
            // (empty setup pose, attachments not yet resolved) would produce a
            // blank or mis-framed thumbnail, so retry on the next frame instead.
            if (size.x <= 0 || size.y <= 0)
              return

            try {
              const dataUrl = canvas!.toDataURL('image/png')
              finish(dataUrl)
            }
            catch (err) {
              console.error('[Spine] Failed to capture preview:', err)
              finish(undefined)
            }
          },
        }

        // Use a custom path handler so AssetManager fetches go through our
        // blob URLs instead of trying the resolved path on the network.
        const SpineCanvasCtor = spine.SpineCanvas as unknown as new (
          canvas: HTMLCanvasElement,
          config: { app: import('@esotericsoftware/spine-webgl').SpineCanvasApp, pathPrefix?: string, webglConfig?: WebGLContextAttributes },
        ) => import('@esotericsoftware/spine-webgl').SpineCanvas

        const spineCanvas = new SpineCanvasCtor(canvas!, {
          app,
          pathPrefix: '',
          webglConfig: { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true },
        })
        void spineCanvas
      }
      catch (err) {
        console.error('[Spine] Preview generation failed:', err)
        finish(undefined)
      }

      // Hard timeout so a stuck load can't block the import flow.
      setTimeout(finish, 4000, undefined)
    })
  }
  catch (err) {
    console.error('[Spine] Preview generation failed:', err)
    return undefined
  }
  finally {
    if (canvas?.isConnected)
      canvas.remove()
    assets?.dispose()
  }
}

/**
 * Patches the AssetManager's Downloader to serve ZIP-extracted assets from
 * memory, bypassing the broken rawDataUris heuristic.
 *
 * NOTICE:
 * Spine's Downloader.rawDataUris treats values without "." as data: URIs
 * (atob decode). Blob URLs in Electron are `blob:null/<uuid>` (no dots) →
 * misidentified as data URIs → status 400. Even real data: URIs corrupt
 * multi-byte binary via atob round-trip.
 * Source: spine-core/AssetManagerBase.js Downloader class.
 * Removal condition: Spine ships a Blob/ArrayBuffer-aware asset loader.
 */
function patchAssetManagerForZipAssets(
  assetManager: import('@esotericsoftware/spine-webgl').AssetManager,
  blobUrls: Record<string, string>,
  rawData: Record<string, Uint8Array | string>,
  texturePaths: string[],
) {
  const downloader = (assetManager as unknown as {
    downloader?: {
      rawDataUris: Record<string, string>
      downloadText: (url: string, success: (data: string) => void, error: (status: number, responseText: string) => void) => void
      downloadBinary: (url: string, success: (data: Uint8Array) => void, error: (status: number, response: unknown) => void) => void
    }
  }).downloader
  if (!downloader)
    return

  const textLookup = new Map<string, string>()
  const binaryLookup = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(rawData)) {
    const bare = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    if (typeof data === 'string') {
      textLookup.set(path, data)
      textLookup.set(bare, data)
    }
    else {
      binaryLookup.set(path, data)
      binaryLookup.set(bare, data)
    }
  }

  const origDownloadText = downloader.downloadText.bind(downloader)
  const origDownloadBinary = downloader.downloadBinary.bind(downloader)

  downloader.downloadText = (url, success, error) => {
    const data = textLookup.get(url)
    if (data !== undefined) {
      queueMicrotask(() => success(data))
      return
    }
    origDownloadText(url, success, error)
  }

  downloader.downloadBinary = (url, success, error) => {
    const data = binaryLookup.get(url)
    if (data !== undefined) {
      queueMicrotask(() => success(data))
      return
    }
    origDownloadBinary(url, success, error)
  }

  for (const path of texturePaths) {
    const url = blobUrls[path]
    if (!url)
      continue
    downloader.rawDataUris[path] = url
    const slash = path.lastIndexOf('/')
    if (slash !== -1)
      downloader.rawDataUris[path.slice(slash + 1)] = url
  }
}
