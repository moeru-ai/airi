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

const offset = {
  x: 0,
  y: 200,
}

const { trackingSource, trackingMode, cameraPosition } = storeToRefs(useModelStore())

// look at mouse
export function useEyeTracking(
  context: MaybeRefOrGetter<ThreeWorldContext>,
) {
  const focusPos = computed<Vector3>(() => {
    if (trackingMode.value === 'camera' || !(trackingSource.value))
      return new Vector3(cameraPosition.value.x, cameraPosition.value.y, cameraPosition.value.z)
    const ctx = toValue(context)
    if (trackingMode.value === 'mouse') {
      const trackingPos = trackingSource.value as unknown as { x: number, y: number }
      const castedPos = castToCam(ctx, new Vector2(trackingPos.x - window.innerWidth / 2 + offset.x, -(trackingPos.y - offset.y)))
      return castedPos
    }
    return ctx.defaultLookAt
  })

  return focusPos
}

function castToCam(ctx: ThreeWorldContext, point: Vector2): Vector3 {
  ctx.raycaster.setFromCamera(point, ctx.camera)

  // Calculate point on near plane using camera parameters
  const nearPlaneDistance = ctx.camera.near
  const direction = ctx.raycaster.ray.direction.clone().normalize().multiplyScalar(20)
  const pointOnNearPlane = ctx.raycaster.ray.origin.clone()
    .add(direction.multiplyScalar(nearPlaneDistance))
  // pointOnNearPlane.setZ(1)
  return pointOnNearPlane
}
