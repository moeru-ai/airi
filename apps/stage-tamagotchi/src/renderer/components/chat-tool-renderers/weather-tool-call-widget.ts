import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { array, object, parseJson, pipe, safeParse, string } from 'valibot'

import WeatherToolCallWidget from './weather-tool-call-widget.vue'

// The weather tool returns its report as a JSON string. A failed call returns an error text, which the schema rejects.
const WeatherReportSchema = pipe(string(), parseJson(), object({
  location: object({ city: string(), country: string() }),
  current: object({
    conditionCode: string(),
    temperature: string(),
    feelsLike: string(),
    humidity: string(),
    wind: string(),
    precipitation: string(),
  }),
  daily: array(object({
    date: string(),
    conditionCode: string(),
    temperature: string(),
    high: string(),
    low: string(),
    wind: string(),
    precipitation: string(),
  })),
}))

/** Shows the current weather and the daily forecast of a weather call. */
export const weatherToolCallWidget: ChatToolCallWidget = {
  component: WeatherToolCallWidget,
  propsOf: (result) => {
    const report = safeParse(WeatherReportSchema, result)
    return report.success ? { report: report.output } : undefined
  },
}
