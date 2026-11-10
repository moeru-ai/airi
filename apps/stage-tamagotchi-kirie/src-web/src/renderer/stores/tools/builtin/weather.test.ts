import type { WeatherReport } from './weather-api'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'
import { weatherTools } from './weather'
import { fetchWeather, geocodeCity, mapWmoCode } from './weather-api'

installStrictToolSchemaMatchers()

const tokyo = { results: [{ name: 'Tokyo', latitude: 35.68, longitude: 139.69, country: 'Japan', timezone: 'Asia/Tokyo' }] }
const forecast = {
  timezone: 'Asia/Tokyo',
  current: { temperature_2m: 21.4, relative_humidity_2m: 60, apparent_temperature: 20.6, weather_code: 2, wind_speed_10m: 11.2, is_day: 0 },
  daily: {
    time: ['2026-10-13', '2026-10-14', '2026-10-15'],
    weather_code: [2, 61, 0],
    temperature_2m_max: [24.2, 22.1, 25],
    temperature_2m_min: [18, 17.4, 16.6],
    precipitation_probability_max: [10, 70, null],
    wind_speed_10m_max: [14.6, 20, 9],
  },
}

/** Answers the geocoding request, then the forecast request, and records both URLs. */
function stubOpenMeteo() {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tokyo) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(forecast) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function forecastParams(fetchMock: ReturnType<typeof vi.fn>) {
  return new URL(fetchMock.mock.calls[1]![0] as string).searchParams
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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
    })

    it('throws on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }))

      await expect(geocodeCity('Tokyo')).rejects.toThrow('Geocoding request failed: 500')
    })
  })

  describe('fetchWeather', () => {
    it('splits days in the time zone of the city and reads the requested number of days', async () => {
      const fetchMock = stubOpenMeteo()

      await fetchWeather('Tokyo', 3)

      expect(forecastParams(fetchMock).get('timezone')).toBe('auto')
      expect(forecastParams(fetchMock).get('forecast_days')).toBe('3')
    })

    it('keeps the requested number of days inside the supported range', async () => {
      const fetchMock = stubOpenMeteo()

      await fetchWeather('Tokyo', 30)

      expect(forecastParams(fetchMock).get('forecast_days')).toBe('7')
    })

    it('labels today and tomorrow, and uses the date for later days', async () => {
      stubOpenMeteo()

      const report = await fetchWeather('Tokyo', 3)

      expect(report.daily.map(day => day.label)).toEqual(['Today', 'Tomorrow', '2026-10-15'])
      expect(report.daily[1]).toEqual({
        date: '2026-10-14',
        label: 'Tomorrow',
        temperature: '17–22°C',
        condition: 'Slight rain',
        conditionCode: 'rain',
        isNight: false,
        precipitation: '70%',
        wind: '20 km/h',
        high: '22°C',
        low: '17°C',
      })
      expect(report.daily[2].precipitation).toBe('--')
    })

    it('gives the current weather the chance of precipitation of today', async () => {
      stubOpenMeteo()

      const report = await fetchWeather('Tokyo', 1)

      expect(report.location).toEqual({ city: 'Tokyo', country: 'Japan', timezone: 'Asia/Tokyo' })
      expect(report.current.label).toBe('Now')
      expect(report.current.conditionCode).toBe('partly-cloudy-night')
      expect(report.current.precipitation).toBe('10%')
      expect(report.current.feelsLike).toBe('21°C')
    })
  })

  describe('get_weather', () => {
    it('has a strict tool schema', async () => {
      expect(await weatherTools()).toSatisfyStrictToolSchemas()
    })

    it('returns the weather report as JSON', async () => {
      const fetchMock = stubOpenMeteo()
      const [getWeather] = await weatherTools()

      const result = await getWeather.execute({ city: 'Tokyo', days: 2 }, { messages: [], toolCallId: 'call-1' })

      const report = JSON.parse(result as string) as WeatherReport
      expect(report.daily.map(day => day.date)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })
})
