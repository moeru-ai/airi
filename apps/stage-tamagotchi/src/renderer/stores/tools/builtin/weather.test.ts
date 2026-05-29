import { describe, expect, it, vi } from 'vitest'

import { geocodeCity, mapWmoCode } from './weather-api'

describe('weather tool helpers', () => {
  describe('mapWmoCode', () => {
    it('maps clear sky during day', () => {
      const result = mapWmoCode(0, false)
      expect(result.conditionCode).toBe('clear-day')
      expect(result.condition).toBe('Clear sky')
    })

    it('maps clear sky at night to clear-night', () => {
      const result = mapWmoCode(0, true)
      expect(result.conditionCode).toBe('clear-night')
    })

    it('maps partly cloudy at night', () => {
      const result = mapWmoCode(2, true)
      expect(result.conditionCode).toBe('partly-cloudy-night')
    })

    it('maps rain codes', () => {
      expect(mapWmoCode(61, false).conditionCode).toBe('rain')
      expect(mapWmoCode(65, false).conditionCode).toBe('extreme-rain')
    })

    it('maps snow codes', () => {
      expect(mapWmoCode(71, false).conditionCode).toBe('snow')
      expect(mapWmoCode(75, false).conditionCode).toBe('extreme-snow')
    })

    it('maps thunderstorm', () => {
      expect(mapWmoCode(95, false).conditionCode).toBe('thunderstorm')
      expect(mapWmoCode(99, false).conditionCode).toBe('thunderstorm')
    })

    it('maps fog', () => {
      expect(mapWmoCode(45, false).conditionCode).toBe('fog')
      expect(mapWmoCode(48, false).conditionCode).toBe('fog')
    })

    it('maps drizzle', () => {
      expect(mapWmoCode(51, false).conditionCode).toBe('drizzle')
    })

    it('maps sleet / freezing', () => {
      expect(mapWmoCode(56, false).conditionCode).toBe('sleet')
      expect(mapWmoCode(66, false).conditionCode).toBe('sleet')
    })

    it('falls back to clear-day for unknown codes', () => {
      expect(mapWmoCode(999, false).conditionCode).toBe('clear-day')
      expect(mapWmoCode(999, false).condition).toBe('Unknown')
    })

    it('does not apply night variant for non-day conditions', () => {
      const result = mapWmoCode(95, true)
      expect(result.conditionCode).toBe('thunderstorm')
    })
  })

  describe('geocodeCity', () => {
    it('throws on empty results', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      }))

      await expect(geocodeCity('NonexistentCity')).rejects.toThrow('City not found')

      vi.unstubAllGlobals()
    })

    it('returns first result', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' }],
        }),
      }))

      const result = await geocodeCity('Tokyo')
      expect(result.name).toBe('Tokyo')
      expect(result.country).toBe('Japan')

      vi.unstubAllGlobals()
    })

    it('throws on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }))

      await expect(geocodeCity('Tokyo')).rejects.toThrow('Geocoding request failed: 500')

      vi.unstubAllGlobals()
    })
  })
})
