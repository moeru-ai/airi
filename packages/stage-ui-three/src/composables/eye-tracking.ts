import type { PerspectiveCamera, Raycaster } from 'three'
import type { MaybeRefOrGetter } from 'vue'

import { storeToRefs } from 'pinia'
import { Vector2, Vector3 } from 'three'
import { computed, toValue } from 'vue'

import { useModelStore } from '../stores/model-store'

interface ThreeWorldContext {
  raycaster: Raycaster
  camera: PerspectiveCamera
  defaultLookAt: Vector3
}

const { trackingSource, trackingMode, cameraPosition } = storeToRefs(useModelStore())

// look at mouse
export function useEyeTracking(
  context: MaybeRefOrGetter<ThreeWorldContext>,
  screenBoundingBox: MaybeRefOrGetter<{ top: number, left: number, height: number, width: number }>,
) {
  const focusPos = computed<Vector3>(() => {
    if (trackingMode.value === 'camera' || !(trackingSource.value))
      return new Vector3(cameraPosition.value.x, cameraPosition.value.y, cameraPosition.value.z)
    const ctx = toValue(context)
    const screen = toValue(screenBoundingBox)
    if (trackingMode.value === 'mouse') {
      const trackingPos = trackingSource.value as unknown as { x: number, y: number }
      // from tracking origin to camera center(screen center)
      const castedPos = castScreenToCam(
        ctx,
        new Vector2(
          ((trackingPos.x - screen.left) / screen.width) * 2 - 1,
          -((trackingPos.y - screen.top) / screen.height) * 2 + 1,
        ),
      )
      return castedPos
    }
    return ctx.defaultLookAt
  })

  return focusPos
}

function castScreenToCam(ctx: ThreeWorldContext, point: Vector2): Vector3 {
  ctx.raycaster.setFromCamera(point, ctx.camera)
  const nearPlaneDistance = ctx.camera.near
  const direction = ctx.raycaster.ray.direction.clone().normalize().multiplyScalar(8)
  const pointOnNearPlane = ctx.raycaster.ray.origin.clone()
    .add(direction.multiplyScalar(nearPlaneDistance))
  return pointOnNearPlane
}
