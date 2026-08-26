import type { Tool } from '@xsai/shared-chat'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { fetchWeather } from './weather-api'
import { executeWidgetAction } from './widgets'

export type { WeatherData } from './weather-api'
export { fetchWeather, geocodeCity, mapWmoCode } from './weather-api'

// -- LLM Tool --

const weatherParams = z.object({
  city: z.string().describe('City name to get weather for, e.g. "Tokyo", "New York", "London"'),
})

async function executeGetWeather(input: { city: string }): Promise<string> {
  const weather = await fetchWeather(input.city)

  await executeWidgetAction({
    action: 'spawn',
    id: `weather-${weather.city.toLowerCase().replace(/\s+/g, '-')}`,
    componentName: 'weather',
    componentProps: weather,
    size: 'm',
    ttlSeconds: 60,
  })

  return `Weather in ${weather.city}, ${weather.country}: ${weather.temperature}, ${weather.condition}. Feels like ${weather.feelsLike}. Humidity ${weather.humidity}, Wind ${weather.wind}.`
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'get_weather',
    description: 'Get current weather for a city and display it as an overlay widget. Returns weather summary text.',
    execute: executeGetWeather,
    parameters: weatherParams,
  }),
]

export const weatherTools = async () => Promise.all(tools)
