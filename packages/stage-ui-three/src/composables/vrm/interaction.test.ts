import { describe, expect, it } from 'vitest'

import {
  getVrmInteractionTargetFromObjectName,
  isClickLikePointerGesture,
} from './interaction'

describe('vrm interaction helpers', () => {
  it('maps collider object names to typed interaction targets', () => {
    expect(getVrmInteractionTargetFromObjectName('vrm_interaction_leftUpperArm')).toBe('leftUpperArm')
    expect(getVrmInteractionTargetFromObjectName('vrm_interaction_rightHand')).toBe('rightHand')
    expect(getVrmInteractionTargetFromObjectName('avatar_mesh')).toBeNull()
    expect(getVrmInteractionTargetFromObjectName('vrm_interaction_unknown')).toBeNull()
  })

  it('accepts small pointer movement as a click', () => {
    expect(isClickLikePointerGesture({ x: 10, y: 10 }, { x: 15, y: 13 })).toBe(true)
    expect(isClickLikePointerGesture({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(false)
  })
})
