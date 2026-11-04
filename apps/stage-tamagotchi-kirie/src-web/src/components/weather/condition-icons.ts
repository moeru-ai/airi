// UnoCSS generates an icon only when its class appears literally in a file that it scans. In this app it scans the .ts files
// under `components/`, so this table lives here and not next to the weather widget.

export type WeatherEffect = 'rain' | 'snow' | 'thunder' | 'fog' | 'cloudy' | 'none'

/** The meteocons icon of each weather condition code. The weather widget and the weather card in the chat show the same icons. */
export const weatherIconMap = {
  'clear-day': { icon: 'i-iconify-meteocons:clear-day-fill', effect: 'none', nightKey: 'clear-night' },
  'clear-night': { icon: 'i-iconify-meteocons:clear-night-fill', effect: 'none' },
  'partly-cloudy-day': { icon: 'i-iconify-meteocons:partly-cloudy-day-fill', effect: 'cloudy', nightKey: 'partly-cloudy-night' },
  'partly-cloudy-night': { icon: 'i-iconify-meteocons:partly-cloudy-night-fill', effect: 'cloudy' },
  'cloudy': { icon: 'i-iconify-meteocons:cloudy-fill', effect: 'cloudy' },
  'overcast': { icon: 'i-iconify-meteocons:overcast-fill', effect: 'cloudy' },
  'rain': { icon: 'i-iconify-meteocons:rain-fill', effect: 'rain' },
  'drizzle': { icon: 'i-iconify-meteocons:drizzle-fill', effect: 'rain' },
  'extreme-rain': { icon: 'i-iconify-meteocons:extreme-rain-fill', effect: 'rain' },
  'thunderstorm': { icon: 'i-iconify-meteocons:thunderstorms-fill', effect: 'thunder' },
  'snow': { icon: 'i-iconify-meteocons:snow-fill', effect: 'snow' },
  'extreme-snow': { icon: 'i-iconify-meteocons:extreme-snow-fill', effect: 'snow' },
  'sleet': { icon: 'i-iconify-meteocons:sleet-fill', effect: 'snow' },
  'hail': { icon: 'i-iconify-meteocons:hail-fill', effect: 'snow' },
  'fog': { icon: 'i-iconify-meteocons:fog-fill', effect: 'fog' },
  'mist': { icon: 'i-iconify-meteocons:mist-fill', effect: 'fog' },
  'haze': { icon: 'i-iconify-meteocons:haze-fill', effect: 'fog' },
  'dust': { icon: 'i-iconify-meteocons:dust-fill', effect: 'fog' },
  'smoke': { icon: 'i-iconify-meteocons:smoke-fill', effect: 'fog' },
  'wind': { icon: 'i-iconify-meteocons:wind-fill', effect: 'cloudy' },
  'tornado': { icon: 'i-iconify-meteocons:tornado-fill', effect: 'thunder' },
  'hurricane': { icon: 'i-iconify-meteocons:hurricane-fill', effect: 'thunder' },
} as Record<string, { icon: string, effect?: WeatherEffect, nightKey?: string }>
