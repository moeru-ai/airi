import type { Tool } from '@xsai/shared-chat'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { fetchWeather, weatherForecastDays } from './weather-api'

export type { WeatherDay, WeatherReport, WeatherView } from './weather-api'
export { fetchWeather, geocodeCity, mapWmoCode } from './weather-api'

// -- LLM Tool --

/** The name of the weather tool. The chat shows the results of calls with this name as a forecast card. */
export const WEATHER_TOOL_NAME = 'get_weather'

const weatherParams = z.object({
  // NOTICE:
  // Open-Meteo geocoding finds English names reliably. On 2026-10-13, "上海" with `language=en` found nothing,
  // "上海市" with `language=zh` found a place in the United States, and "東京" with `language=ja` found nothing.
  // Source: https://geocoding-api.open-meteo.com/v1/search
  // Remove this rule when the tool resolves names in other languages, for example with a second search.
  city: z.string().describe('English name of the city, for example "Shanghai", "Tokyo", or "New York". Translate a city name in another language to English.'),
  days: z.number().int().min(weatherForecastDays.min).max(weatherForecastDays.max).describe('Number of forecast days from today. Use 1 for today only, 2 to include tomorrow.'),
})

/**
 * Returns the weather as JSON for the model. It does not show a widget.
 *
 * NOTICE:
 * The tool description tells the model how to show the result with `stage_widgets`.
 * The description is the only text that reaches the model with this tool. `useLlmToolsetPromptsStore` joins every
 * registered prompt into every turn, so a toolset prompt would also reach turns without the weather tool.
 * Source: `packages/stage-ui/src/stores/ai/chat-llm/toolset-prompts.ts`.
 * Move the instruction into a toolset prompt when a toolset prompt reaches only turns that have its tools.
 */
async function executeGetWeather(input: { city: string, days: number }): Promise<string> {
  return JSON.stringify(await fetchWeather(input.city, input.days))
}

const tools: Promise<Tool>[] = [
  tool({
    name: WEATHER_TOOL_NAME,
    description: [
      'Get the current weather and a daily forecast for a city. Returns JSON with `location`, `current`, and `daily`.',
      '`daily[0]` is today in the time zone of the city. `precipitation` is the chance of precipitation.',
      'To show the weather to the user, you can call `stage_widgets` with action `spawn`, componentName `weather`,',
      'and componentProps set to `current` or one `daily` entry, plus `city` from `location`.',
    ].join(' '),
    execute: executeGetWeather,
    parameters: weatherParams,
  }),
]

export const weatherTools = async () => Promise.all(tools)
