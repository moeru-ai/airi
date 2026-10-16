import type { ChatToolCallWidget } from '@proj-airi/stage-ui/components'

import { readToolResult } from '@proj-airi/stage-ui/components'
import { array, boolean, isoDate, looseObject, parseJson, picklist, pipe, string } from 'valibot'

import WeatherToolCallWidget from './weather-tool-call-widget.vue'

import { weatherIconMap } from '../weather/condition-icons'

// A code without an icon, or a date that is not a calendar date, can come from an imported chat. Such a report shows as raw data.
const conditionFields = { condition: string(), conditionCode: picklist(Object.keys(weatherIconMap)), isNight: boolean(), label: string() }

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
    date: pipe(string(), isoDate()),
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
