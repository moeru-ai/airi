// -- Open-Meteo API types --

interface GeocodingResult {
  results?: Array<{
    country: string
    latitude: number
    longitude: number
    name: string
    timezone: string
  }>
}

interface OpenMeteoWeather {
  current: {
    apparent_temperature: number
    is_day: number
    precipitation: number
    relative_humidity_2m: number
    temperature_2m: number
    weather_code: number
    wind_speed_10m: number
  }
  daily?: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

// -- WMO Weather Code Mapping --
// https://open-meteo.com/en/docs#weathervariables

const wmoCodeToCondition: Record<number, { condition: string, conditionCode: string }> = {
  0: { condition: 'Clear sky', conditionCode: 'clear-day' },
  1: { condition: 'Mainly clear', conditionCode: 'clear-day' },
  2: { condition: 'Partly cloudy', conditionCode: 'partly-cloudy-day' },
  3: { condition: 'Overcast', conditionCode: 'overcast' },
  45: { condition: 'Fog', conditionCode: 'fog' },
  48: { condition: 'Depositing rime fog', conditionCode: 'fog' },
  51: { condition: 'Light drizzle', conditionCode: 'drizzle' },
  53: { condition: 'Moderate drizzle', conditionCode: 'drizzle' },
  55: { condition: 'Dense drizzle', conditionCode: 'drizzle' },
  56: { condition: 'Freezing drizzle', conditionCode: 'sleet' },
  57: { condition: 'Dense freezing drizzle', conditionCode: 'sleet' },
  61: { condition: 'Slight rain', conditionCode: 'rain' },
  63: { condition: 'Moderate rain', conditionCode: 'rain' },
  65: { condition: 'Heavy rain', conditionCode: 'extreme-rain' },
  66: { condition: 'Freezing rain', conditionCode: 'sleet' },
  67: { condition: 'Heavy freezing rain', conditionCode: 'sleet' },
  71: { condition: 'Slight snow', conditionCode: 'snow' },
  73: { condition: 'Moderate snow', conditionCode: 'snow' },
  75: { condition: 'Heavy snow', conditionCode: 'extreme-snow' },
  77: { condition: 'Snow grains', conditionCode: 'snow' },
  80: { condition: 'Slight rain showers', conditionCode: 'rain' },
  81: { condition: 'Moderate rain showers', conditionCode: 'rain' },
  82: { condition: 'Violent rain showers', conditionCode: 'extreme-rain' },
  85: { condition: 'Slight snow showers', conditionCode: 'snow' },
  86: { condition: 'Heavy snow showers', conditionCode: 'extreme-snow' },
  95: { condition: 'Thunderstorm', conditionCode: 'thunderstorm' },
  96: { condition: 'Thunderstorm with slight hail', conditionCode: 'thunderstorm' },
  99: { condition: 'Thunderstorm with heavy hail', conditionCode: 'thunderstorm' },
}

export interface WeatherData {
  city: string
  condition: string
  conditionCode: string
  country: string
  feelsLike: string
  high?: string
  humidity: string
  isNight: boolean
  low?: string
  precipitation: string
  temperature: string
  wind: string
}

export async function fetchWeather(city: string): Promise<WeatherData> {
  const geo = await geocodeCity(city)

  const params = new URLSearchParams({
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    forecast_days: '1',
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)

  if (!res.ok)
    throw new Error(`Weather request failed: ${res.status}`)

  const data: OpenMeteoWeather = await res.json()
  const current = data.current
  const isNight = current.is_day === 0
  const { condition, conditionCode } = mapWmoCode(current.weather_code, isNight)

  return {
    city: geo.name,
    condition,
    conditionCode,
    country: geo.country,
    feelsLike: `${Math.round(current.apparent_temperature)}°C`,
    high: data.daily ? `${Math.round(data.daily.temperature_2m_max[0])}°C` : undefined,
    humidity: `${current.relative_humidity_2m}%`,
    isNight,
    low: data.daily ? `${Math.round(data.daily.temperature_2m_min[0])}°C` : undefined,
    precipitation: `${current.precipitation} mm`,
    temperature: `${Math.round(current.temperature_2m)}°C`,
    wind: `${Math.round(current.wind_speed_10m)} km/h`,
  }
}

export async function geocodeCity(city: string): Promise<{ country: string, latitude: number, longitude: number, name: string }> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  const res = await fetch(url)

  if (!res.ok)
    throw new Error(`Geocoding request failed: ${res.status}`)

  const data: GeocodingResult = await res.json()

  if (!data.results?.length)
    throw new Error(`City not found: "${city}"`)

  const result = data.results[0]
  return { country: result.country, latitude: result.latitude, longitude: result.longitude, name: result.name }
}

export function mapWmoCode(code: number, isNight: boolean): { condition: string, conditionCode: string } {
  const mapped = wmoCodeToCondition[code] ?? { condition: 'Unknown', conditionCode: 'clear-day' }

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
