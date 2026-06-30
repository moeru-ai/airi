import { describe, expect, it, vi } from 'vitest'

import { fetchWeather, geocodeCity, mapWmoCode } from './weather-api'

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
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        }),
      )

      await expect(geocodeCity('NonexistentCity')).rejects.toThrow('City not found')

      vi.unstubAllGlobals()
    })

    it('returns first result', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
              ],
            }),
        }),
      )

      const result = await geocodeCity('Tokyo')
      expect(result.name).toBe('Tokyo')
      expect(result.country).toBe('Japan')

      vi.unstubAllGlobals()
    })

    it('throws on HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
        }),
      )

      await expect(geocodeCity('Tokyo')).rejects.toThrow('Geocoding request failed: 400')

      vi.unstubAllGlobals()
    })
  })

  describe('fetchWeather', () => {
    it('returns daytime weather with correct fields', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                current: {
                  temperature_2m: 25.4,
                  relative_humidity_2m: 60,
                  apparent_temperature: 27.1,
                  weather_code: 0,
                  wind_speed_10m: 12.3,
                  precipitation: 0.5,
                  is_day: 1,
                },
                daily: { temperature_2m_max: [30.1], temperature_2m_min: [20.6] },
              }),
          }),
      )

      const result = await fetchWeather('Tokyo')
      expect(result.city).toBe('Tokyo')
      expect(result.country).toBe('Japan')
      expect(result.temperature).toBe('25°C')
      expect(result.condition).toBe('Clear sky')
      expect(result.conditionCode).toBe('clear-day')
      expect(result.isNight).toBe(false)
      expect(result.feelsLike).toBe('27°C')
      expect(result.humidity).toBe('60%')
      expect(result.wind).toBe('12 km/h')
      expect(result.precipitation).toBe('0.5 mm')
      expect(result.high).toBe('30°C')
      expect(result.low).toBe('21°C')

      vi.unstubAllGlobals()
    })

    it('returns nighttime weather with clear-night conditionCode', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                current: {
                  temperature_2m: 15.2,
                  relative_humidity_2m: 80,
                  apparent_temperature: 13.0,
                  weather_code: 0,
                  wind_speed_10m: 5.7,
                  precipitation: 0,
                  is_day: 0,
                },
                daily: { temperature_2m_max: [22.0], temperature_2m_min: [14.5] },
              }),
          }),
      )

      const result = await fetchWeather('Tokyo')
      expect(result.conditionCode).toBe('clear-night')
      expect(result.isNight).toBe(true)

      vi.unstubAllGlobals()
    })

    it('includes high and low from daily data', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                current: {
                  temperature_2m: 25.4,
                  relative_humidity_2m: 60,
                  apparent_temperature: 27.1,
                  weather_code: 0,
                  wind_speed_10m: 12.3,
                  precipitation: 0.5,
                  is_day: 1,
                },
                daily: { temperature_2m_max: [30.1], temperature_2m_min: [20.6] },
              }),
          }),
      )

      const result = await fetchWeather('Tokyo')
      expect(result.high).toBe('30°C')
      expect(result.low).toBe('21°C')

      vi.unstubAllGlobals()
    })

    it('omits high and low when daily is undefined', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                current: {
                  temperature_2m: 20,
                  relative_humidity_2m: 50,
                  apparent_temperature: 19,
                  weather_code: 3,
                  wind_speed_10m: 8,
                  precipitation: 0,
                  is_day: 1,
                },
              }),
          }),
      )

      const result = await fetchWeather('Tokyo')
      expect(result.high).toBeUndefined()
      expect(result.low).toBeUndefined()

      vi.unstubAllGlobals()
    })

    it('throws on weather HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                results: [
                  { name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' },
                ],
              }),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 400,
          }),
      )

      await expect(fetchWeather('Tokyo')).rejects.toThrow('Weather request failed: 400')

      vi.unstubAllGlobals()
    })
  })
})
