import { object, string } from 'valibot'

import Weather from './Weather.vue'

import { defineCallingComponent } from '../../plugin-component-calling'

export { default as Weather } from './Weather.vue'

export const weatherComponent = defineCallingComponent(
  'weather',
  Weather,
  object({
    city: string(),
    condition: string(),
    temperature: string(),
  }),
  {
    city: 'Tokyo',
    condition: 'Sunny',
    temperature: '25°',
  },
)
