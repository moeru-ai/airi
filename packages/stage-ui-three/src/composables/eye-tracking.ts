import type { PerspectiveCamera, Raycaster } from 'three'
import type { MaybeRefOrGetter } from 'vue'

import type { TrackingMode, Vec3 } from '../stores/model-store'

import { Vector2, Vector3 } from 'three'
import { computed, toValue } from 'vue'

interface VRMWorldContext {
  raycaster: Raycaster
  camera: PerspectiveCamera
  defaultLookAt: Vector3
}

export interface VRMEyeFocusSource {
  x: number
  y: number
}

/**
 * Maps cursor and camera tracking modes into a VRM world-space eye focus target.
 *
 * Use when:
 * - A VRM model needs a look-at target derived from scene-local cursor coordinates.
 * - The scene owns the screen bounds used to normalize pointer coordinates.
 *
 * Expects:
 * - Source coordinates are relative to the browser viewport or Electron window that contains the scene.
 * - Screen bounds are in the same client coordinate space as the source.
 *
 * Returns:
 * - A computed Three.js vector suitable for VRM eye focus updates.
 */
export function useVRMEyeFocusFor(options: {
  cameraPosition: MaybeRefOrGetter<Vec3>
  context: MaybeRefOrGetter<VRMWorldContext>
  screenBoundingBox: MaybeRefOrGetter<{ top: number, left: number, height: number, width: number }>
  source: MaybeRefOrGetter<VRMEyeFocusSource | null | undefined>
  trackingMode: MaybeRefOrGetter<TrackingMode>
}) {
  const focusPos = computed<Vector3>(() => {
    const trackingMode = toValue(options.trackingMode)
    if (trackingMode === 'camera') {
      const cameraPosition = toValue(options.cameraPosition)
      return new Vector3(cameraPosition.x, cameraPosition.y, cameraPosition.z)
    }

    const ctx = toValue(options.context)
    const trackingSource = toValue(options.source)
    if (trackingMode === 'none' || !trackingSource)
      return ctx.defaultLookAt
    const screen = toValue(options.screenBoundingBox)
    if (trackingMode === 'mouse') {
      const castedPos = castScreenToCam(
        ctx,
        new Vector2(
          ((trackingSource.x - screen.left) / screen.width) * 2 - 1,
          -((trackingSource.y - screen.top) / screen.height) * 2 + 1,
        ),
      )
      return castedPos
    }
    return ctx.defaultLookAt
  })

  return focusPos
}

function castScreenToCam(ctx: VRMWorldContext, point: Vector2): Vector3 {
  ctx.raycaster.setFromCamera(point, ctx.camera)
  const nearPlaneDistance = ctx.camera.near
  const direction = ctx.raycaster.ray.direction.clone().normalize().multiplyScalar(8)
  const pointOnNearPlane = ctx.raycaster.ray.origin.clone()
    .add(direction.multiplyScalar(nearPlaneDistance))
  return pointOnNearPlane
}
