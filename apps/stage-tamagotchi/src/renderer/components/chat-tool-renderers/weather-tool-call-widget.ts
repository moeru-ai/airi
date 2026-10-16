import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { array, boolean, looseObject, parseJson, pipe, string } from 'valibot'

import WeatherToolCallWidget from './weather-tool-call-widget.vue'

const conditionFields = { condition: string(), conditionCode: string(), isNight: boolean(), label: string() }

// The weather tool returns its report as a JSON string. A failed call returns an error text, which the schema rejects.
// The schema names the fields the card shows. `isNight` shows in the icon of `conditionCode`, and `label` as the drawer name.
// Every other field shows under the card as other data.
const WeatherReportSchema = pipe(string(), parseJson(), looseObject({
  location: looseObject({ city: string(), country: string(), timezone: string() }),
  current: looseObject({
    ...conditionFields,
    temperature: string(),
    feelsLike: string(),
    humidity: string(),
    wind: string(),
    precipitation: string(),
    // The high and the low of now are those of today, which the drawer of today shows.
    high: string(),
    low: string(),
  }),
  daily: array(looseObject({
    ...conditionFields,
    date: string(),
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
  read: result => readToolResult(WeatherReportSchema, result, report => ({ report })),
}
