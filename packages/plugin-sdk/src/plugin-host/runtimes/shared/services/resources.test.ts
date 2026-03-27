import { describe, expect, it, vi } from 'vitest'

import { ResourceService } from './resources'

describe('resourceService', () => {
  it('should prefer resolver values over stored values', async () => {
    const service = new ResourceService()
    const resolver = vi.fn(async () => 'from-resolver')

    service.setValue('resource:theme', 'from-value')
    service.setResolver('resource:theme', resolver)

    await expect(service.get('resource:theme')).resolves.toBe('from-resolver')
    expect(resolver).toHaveBeenCalledOnce()
    expect(service.has('resource:theme')).toBe(true)
  })

  it('should return stored values and fallbacks when a resolver is not registered', async () => {
    const service = new ResourceService()

    service.setValue('resource:locale', 'en-US')

    await expect(service.get('resource:locale')).resolves.toBe('en-US')
    await expect(service.get('resource:missing', 'fallback')).resolves.toBe('fallback')
    expect(service.has('resource:missing')).toBe(false)
  })

  it('should stop resolving resources after the resolver and value are removed', async () => {
    const service = new ResourceService()

    service.setResolver('resource:user', () => ({ id: 'resolver' }))
    service.setValue('resource:user', { id: 'value' })

    service.removeResolver('resource:user')
    await expect(service.get('resource:user')).resolves.toEqual({ id: 'value' })

    service.removeValue('resource:user')
    await expect(service.get('resource:user')).resolves.toBeUndefined()
    expect(service.has('resource:user')).toBe(false)
  })
})
