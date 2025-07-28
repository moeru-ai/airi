import { object, string } from 'valibot'

import Weather from './Weather.vue'

import { defineCCComponent } from '../../plugin-component-calling'

export { default as Weather } from './Weather.vue'

export const weatherComponent = defineCCComponent(
  'weather',
  Weather,
  object({
    city: string(),
    temperature: string(),
    condition: string(),
  }),
  {
    city: 'Tokyo',
    temperature: '25°',
    condition: 'Sunny',
  },
)
