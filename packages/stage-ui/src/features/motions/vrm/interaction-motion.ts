import type { VrmInteractionTarget } from '@proj-airi/stage-ui-three'

/** Click-only collider reactions. Arm regions retain expression feedback and never imply dragging or hand IK. */
export function interactionMotion(target: VrmInteractionTarget) {
  if (target === 'head')
    return 'nod'
  if (target === 'leftHand' || target === 'rightHand')
    return 'wave'
  if (target === 'leftFoot' || target === 'rightFoot')
    return 'bow'
  return undefined
}
