import type { PatternDefinition } from '../../world/types'

/**
 * Teabag pattern: detects rapid crouching behavior
 */
export const teabagPattern: PatternDefinition = {
  id: 'teabag',
  category: 'social',
  description: 'Rapid crouching, typically a greeting or taunt',

  compute(entityId, getState, getHistory, selfPosition) {
    // Get sneaking state changes in the last 2 seconds
    const since = Date.now() - 2000
    const changes = getHistory(entityId, since).filter(c => c.field === 'isSneaking')

    // Need at least 4 toggles (2 full crouch cycles)
    if (changes.length < 4) {
      return { confidence: 0 }
    }

    // Check distance if we have self position
    const entity = getState(entityId)
    if (entity && selfPosition) {
      const dx = entity.position.x - selfPosition.x
      const dy = entity.position.y - selfPosition.y
      const dz = entity.position.z - selfPosition.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

      // Too far away, reduce confidence
      if (distance > 15) {
        return { confidence: 0, data: { toggles: changes.length, distance } }
      }
    }

    // Calculate frequency (toggles per second)
    const duration = (changes[changes.length - 1].timestamp - changes[0].timestamp) / 1000
    const frequency = duration > 0 ? changes.length / duration : 0

    // Confidence based on:
    // - Number of toggles (more = more confident, up to 8)
    // - Frequency (faster = more confident, up to 4 Hz)
    const countFactor = Math.min(1, changes.length / 8)
    const frequencyFactor = Math.min(1, frequency / 4)

    const confidence = (countFactor * 0.4) + (frequencyFactor * 0.6)

    return {
      confidence,
      data: {
        toggles: changes.length,
        frequency: Math.round(frequency * 100) / 100,
        duration: Math.round(duration * 1000),
      },
    }
  },
}
