---
category: Sensors
---

# useGeolocation

Reactive [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API). It allows the user to provide their location to web applications if they so desire. For privacy reasons, the user is asked for permission to report location information.

## Usage

```ts
import { useGeolocation } from '@vueuse/core'

const { coords, locatedAt, error, resume, pause } = useGeolocation()
```

| State     | Type                                                                          | Description                                                              |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| coords    | [`Coordinates`](https://developer.mozilla.org/en-US/docs/Web/API/Coordinates) | information about the position retrieved like the latitude and longitude |
| locatedAt | `Date`                                                                        | The time of the last geolocation call                                    |
| error     | `string`                                                                      | An error message in case geolocation API fails.                          |
| resume    | `function`                                                                    | Control function to resume updating geolocation                          |
| pause     | `function`                                                                    | Control function to pause updating geolocation                           |

## Config

`useGeolocation` function takes [PositionOptions](https://developer.mozilla.org/en-US/docs/Web/API/PositionOptions) object as an optional parameter.

## Component Usage

```vue
<template>
  <UseGeolocation v-slot="{ coords: { latitude, longitude } }">
    Latitude: {{ latitude }}
    Longitude: {{ longitude }}
  </UseGeolocation>
</template>
```

## Type Declarations

```ts
export interface UseGeolocationOptions
  extends Partial<PositionOptions>, ConfigurableNavigator {
  immediate?: boolean
}
export interface UseGeolocationReturn extends Supportable {
  coords: ShallowRef<Omit<GeolocationPosition["coords"], "toJSON">>
  locatedAt: ShallowRef<number | null>
  error: ShallowRef<GeolocationPositionError | null>
  resume: () => void
  pause: () => void
}
/**
 * Reactive Geolocation API.
 *
 * @see https://vueuse.org/useGeolocation
 * @param options
 */
export declare function useGeolocation(
  options?: UseGeolocationOptions,
): UseGeolocationReturn
```
