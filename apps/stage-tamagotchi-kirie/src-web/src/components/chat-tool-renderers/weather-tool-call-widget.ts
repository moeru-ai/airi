import type { ToolResultCoverage } from '@proj-airi/stage-ui/components'

import { defineToolCallWidget, restOf } from '@proj-airi/stage-ui/components'
import { array, boolean, isoDate, looseObject, parseJson, pipe, safeParse, string } from 'valibot'

import WeatherToolCallWidget from './weather-tool-call-widget.vue'

const conditionFields = { condition: string(), conditionCode: string(), isNight: boolean(), label: string() }

// The weather tool returns its report as a JSON string. A failed call returns an error text, which the schema rejects.
// A forecast date that is not a calendar date, for example from an imported chat, also makes the report show as raw data.
const WeatherReportSchema = pipe(string(), parseJson(), looseObject({
  location: looseObject({ city: string(), country: string(), timezone: string() }),
  current: looseObject({
    ...conditionFields,
    temperature: string(),
    feelsLike: string(),
    humidity: string(),
    wind: string(),
    precipitation: string(),
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

const SHOWN = {
  location: { city: true, country: true, timezone: true },
  current: { condition: true, conditionCode: true, temperature: true, feelsLike: true, humidity: true, wind: true, precipitation: true },
  daily: [{ condition: true, conditionCode: true, date: true, temperature: true, high: true, low: true, wind: true, precipitation: true }],
} satisfies ToolResultCoverage

const OMITTED = {
  // `label` repeats the position of an entry, which the drawer names in the language of the user.
  // `isNight` shows in the icon of `conditionCode`. The high and the low of now are those of today, which the drawer of today shows.
  current: { label: true, isNight: true, high: true, low: true },
  daily: [{ label: true, isNight: true }],
} satisfies ToolResultCoverage

/** Shows the current weather and the daily forecast of a weather call. */
export const weatherToolCallWidget = defineToolCallWidget(WeatherToolCallWidget, (result) => {
  const report = safeParse(WeatherReportSchema, result)
  return report.success ? { props: { report: report.output }, rest: restOf(report.output, SHOWN, OMITTED) } : undefined
})
