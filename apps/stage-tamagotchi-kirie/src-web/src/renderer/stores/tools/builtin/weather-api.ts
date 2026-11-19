// -- Open-Meteo API types --

interface GeocodingResult {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    country: string
    timezone: string
  }>
}

interface OpenMeteoWeather {
  timezone: string
  current: {
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    weather_code: number
    wind_speed_10m: number
    is_day: number
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: Array<number | null>
    wind_speed_10m_max: number[]
  }
}

// -- WMO Weather Code Mapping --
// https://open-meteo.com/en/docs#weathervariables

const wmoCodeToCondition: Record<number, { conditionCode: string, condition: string }> = {
  0: { conditionCode: 'clear-day', condition: 'Clear sky' },
  1: { conditionCode: 'clear-day', condition: 'Mainly clear' },
  2: { conditionCode: 'partly-cloudy-day', condition: 'Partly cloudy' },
  3: { conditionCode: 'overcast', condition: 'Overcast' },
  45: { conditionCode: 'fog', condition: 'Fog' },
  48: { conditionCode: 'fog', condition: 'Depositing rime fog' },
  51: { conditionCode: 'drizzle', condition: 'Light drizzle' },
  53: { conditionCode: 'drizzle', condition: 'Moderate drizzle' },
  55: { conditionCode: 'drizzle', condition: 'Dense drizzle' },
  56: { conditionCode: 'sleet', condition: 'Freezing drizzle' },
  57: { conditionCode: 'sleet', condition: 'Dense freezing drizzle' },
  61: { conditionCode: 'rain', condition: 'Slight rain' },
  63: { conditionCode: 'rain', condition: 'Moderate rain' },
  65: { conditionCode: 'extreme-rain', condition: 'Heavy rain' },
  66: { conditionCode: 'sleet', condition: 'Freezing rain' },
  67: { conditionCode: 'sleet', condition: 'Heavy freezing rain' },
  71: { conditionCode: 'snow', condition: 'Slight snow' },
  73: { conditionCode: 'snow', condition: 'Moderate snow' },
  75: { conditionCode: 'extreme-snow', condition: 'Heavy snow' },
  77: { conditionCode: 'snow', condition: 'Snow grains' },
  80: { conditionCode: 'rain', condition: 'Slight rain showers' },
  81: { conditionCode: 'rain', condition: 'Moderate rain showers' },
  82: { conditionCode: 'extreme-rain', condition: 'Violent rain showers' },
  85: { conditionCode: 'snow', condition: 'Slight snow showers' },
  86: { conditionCode: 'extreme-snow', condition: 'Heavy snow showers' },
  95: { conditionCode: 'thunderstorm', condition: 'Thunderstorm' },
  96: { conditionCode: 'thunderstorm', condition: 'Thunderstorm with slight hail' },
  99: { conditionCode: 'thunderstorm', condition: 'Thunderstorm with heavy hail' },
}

/**
 * The fields that the weather widget shows for one moment or one day.
 *
 * The tool result uses the prop names of `widgets/weather/components/Weather.vue`, so the model can pass one entry
 * to `stage_widgets` as it is. `precipitation` is a chance, because the widget labels it "Chance of rain".
 */
export interface WeatherView {
  /** What the widget shows above the city, for example `Now`, `Today`, `Tomorrow`, or a date. */
  label: string
  temperature: string
  condition: string
  conditionCode: string
  isNight: boolean
  precipitation: string
  wind: string
  high?: string
  low?: string
  feelsLike?: string
  humidity?: string
}

/** One forecast day in the local calendar of the location. */
export interface WeatherDay extends WeatherView {
  /** `YYYY-MM-DD` in the time zone of the location. */
  date: string
}

export interface WeatherReport {
  location: { city: string, country: string, timezone: string }
  current: WeatherView
  /** Index 0 is today in the time zone of the location. */
  daily: WeatherDay[]
}

/** The forecast range that the tool accepts, in days from today. */
export const weatherForecastDays = { min: 1, max: 7 } as const

export function mapWmoCode(code: number, isNight: boolean): { conditionCode: string, condition: string } {
  const mapped = wmoCodeToCondition[code] ?? { conditionCode: 'clear-day', condition: 'Unknown' }

  if (isNight) {
    const nightVariants: Record<string, string> = {
      'clear-day': 'clear-night',
      'partly-cloudy-day': 'partly-cloudy-night',
    }
    return {
      ...mapped,
      conditionCode: nightVariants[mapped.conditionCode] ?? mapped.conditionCode,
    }
  }

  return mapped
}

export async function geocodeCity(city: string): Promise<{ name: string, latitude: number, longitude: number, country: string }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  const res = await fetch(url)

  if (!res.ok)
    throw new Error(`Geocoding request failed: ${res.status}`)

  const data: GeocodingResult = await res.json()

  if (!data.results?.length)
    throw new Error(`City not found: "${city}"`)

  const result = data.results[0]
  return { name: result.name, latitude: result.latitude, longitude: result.longitude, country: result.country }
}

function formatTemperature(value: number) {
  return `${Math.round(value)}°C`
}

function formatChance(value: number | null | undefined) {
  return value == null ? '--' : `${value}%`
}

function dayLabel(index: number, date: string) {
  if (index === 0)
    return 'Today'
  if (index === 1)
    return 'Tomorrow'
  return date
}

/**
 * Reads the current weather and a daily forecast for a city.
 *
 * `timezone: auto` makes Open-Meteo split days in the time zone of the location. Without it, a day is a UTC day,
 * so the high and low of "today" in Shanghai cover a range that starts at 08:00 local time.
 */
export async function fetchWeather(city: string, days: number): Promise<WeatherReport> {
  const geo = await geocodeCity(city)
  const forecastDays = Math.min(Math.max(Math.round(days), weatherForecastDays.min), weatherForecastDays.max)

  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    timezone: 'auto',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    forecast_days: String(forecastDays),
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)

  if (!res.ok)
    throw new Error(`Weather request failed: ${res.status}`)

  const data: OpenMeteoWeather = await res.json()
  const current = data.current
  const isNight = current.is_day === 0
  const daily = data.daily.time.map((date, index): WeatherDay => {
    const high = formatTemperature(data.daily.temperature_2m_max[index])
    const low = formatTemperature(data.daily.temperature_2m_min[index])
    return {
      date,
      label: dayLabel(index, date),
      // One unit for the range keeps the text on one line in the medium widget.
      temperature: `${Math.round(data.daily.temperature_2m_min[index])}–${high}`,
      ...mapWmoCode(data.daily.weather_code[index], false),
      isNight: false,
      precipitation: formatChance(data.daily.precipitation_probability_max[index]),
      wind: `${Math.round(data.daily.wind_speed_10m_max[index])} km/h`,
      high,
      low,
    }
  })

  return {
    location: { city: geo.name, country: geo.country, timezone: data.timezone },
    current: {
      label: 'Now',
      temperature: formatTemperature(current.temperature_2m),
      ...mapWmoCode(current.weather_code, isNight),
      isNight,
      // The current block has no chance of precipitation. The chance of today is the closest value.
      precipitation: daily[0]?.precipitation ?? '--',
      wind: `${Math.round(current.wind_speed_10m)} km/h`,
      high: daily[0]?.high,
      low: daily[0]?.low,
      feelsLike: formatTemperature(current.apparent_temperature),
      humidity: `${current.relative_humidity_2m}%`,
    },
    daily,
  }
}
