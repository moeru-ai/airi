import type { VRM } from '@pixiv/three-vrm'

/**
 * Sign of the x and z rotations that the procedural layers write on normalized bones.
 *
 * The procedural values of this package (thinking pose, mood body, performance director) are tuned on
 * the Neptuna test model, a VRM 0.x. The normalized bones of a VRM 0.x face -Z, and a VRM 1.0 faces +Z,
 * so an x or z rotation turns the other way on a VRM 1.0. three-vrm makes the same flip, in the other
 * direction, when `createVRMAnimationClip` plays a VRMA on a VRM 0.x.
 *
 * Returns 1 for a VRM 0.x and for a model without meta, and -1 for a VRM 1.0.
 */
export function proceduralAxisSign(vrm: Pick<VRM, 'meta'> | { meta?: { metaVersion?: string } }): 1 | -1 {
  return vrm.meta?.metaVersion === '1' ? -1 : 1
}
