import { describe, expect, it } from 'vitest'

import { interactionMotion } from './interaction-motion'

describe('click-only region motions', () => {
  it('maps head, hand, and foot clicks to compact registered gestures', () => {
    expect(interactionMotion('head')).toBe('nod')
    expect(interactionMotion('leftHand')).toBe('wave')
    expect(interactionMotion('rightHand')).toBe('wave')
    expect(interactionMotion('leftFoot')).toBe('bow')
    expect(interactionMotion('rightFoot')).toBe('bow')
  })
  it('does not invent dragging or arm IK', () => {
    expect(interactionMotion('leftUpperArm')).toBeUndefined()
    expect(interactionMotion('leftLowerArm')).toBeUndefined()
    expect(interactionMotion('rightUpperArm')).toBeUndefined()
    expect(interactionMotion('rightLowerArm')).toBeUndefined()
  })
})
