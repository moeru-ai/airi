---
category: '@Integrations'
---

# useCookies

Wrapper for [`universal-cookie`](https://www.npmjs.com/package/universal-cookie).

::: tip
When using with Nuxt 3, this functions will **NOT** be auto imported in favor of Nuxt's built-in [`useCookie()`](https://v3.nuxtjs.org/api/composables/use-cookie). Use explicit import if you want to use the function from VueUse.
:::

## Install

```bash
npm i universal-cookie@^7
```

## Usage

### Common usage

```vue
<script setup lang="ts">
import { useCookies } from '@vueuse/integrations/useCookies'

const cookies = useCookies(['locale'])
</script>

<template>
  <div>
    <strong>locale</strong>: {{ cookies.get('locale') }}
    <hr>
    <pre>{{ cookies.getAll() }}</pre>
    <button @click="cookies.set('locale', 'ru-RU')">
      Russian
    </button>
    <button @click="cookies.set('locale', 'en-US')">
      English
    </button>
  </div>
</template>
```

## Options

Access and modify cookies using vue composition-api.

> By default, you should use it inside `setup()`, but this function also works anywhere else.

```ts
import { useCookies } from '@vueuse/integrations/useCookies'
// ---cut---
const {
  get,
  getAll,
  set,
  remove,
  addChangeListener,
  removeChangeListener
} = useCookies(['cookie-name'], {
  doNotParse: false,
  autoUpdateDependencies: false
})
```

### `dependencies` (optional)

Let you optionally specify a list of cookie names your component depend on or that should trigger a re-render. If unspecified, it will render on every cookie change.

### `options` (optional)

- `doNotParse` (boolean = false): do not convert the cookie into an object no matter what. **Passed as default value to `get`/`getAll` methods.**
- `autoUpdateDependencies` (boolean = false): automatically add cookie names ever provided to `get` method. If **true** then you don't need to care about provided `dependencies`.

### `cookies` (optional)

Let you provide a `universal-cookie` instance (creates a new instance by default)

> Info about methods available in the [universal-cookie api docs](https://www.npmjs.com/package/universal-cookie#api---cookies-class)

## `createCookies([req])`

Create a `universal-cookie` instance using request (default is window.document.cookie) and returns `useCookies` function with provided universal-cookie instance

- req (object): Node's [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage) request object

## Type Declarations

```ts
/**
 * Creates a new {@link useCookies} function
 * @param req - incoming http request (for SSR)
 * @see https://github.com/reactivestack/cookies/tree/master/packages/universal-cookie universal-cookie
 * @description Creates universal-cookie instance using request (default is window.document.cookie) and returns {@link useCookies} function with provided universal-cookie instance
 */
export declare function createCookies(req?: IncomingMessage): (
  dependencies?: string[] | null,
  {
    doNotParse,
    autoUpdateDependencies,
  }?: {
    doNotParse?: boolean | undefined
    autoUpdateDependencies?: boolean | undefined
  },
) => {
  /**
   * Reactive get cookie by name. If **autoUpdateDependencies = true** then it will update watching dependencies
   */
  get: <T = any>(name: string, options?: CookieGetOptions | undefined) => T
  /**
   * Reactive get all cookies
   */
  getAll: <T = any>(options?: CookieGetOptions | undefined) => T
  set: (
    name: string,
    value: any,
    options?: CookieSetOptions | undefined,
  ) => void
  remove: (name: string, options?: CookieSetOptions | undefined) => void
  addChangeListener: (callback: CookieChangeListener) => void
  removeChangeListener: (callback: CookieChangeListener) => void
}
/**
 * Reactive methods to work with cookies (use {@link createCookies} method instead if you are using SSR)
 * @param dependencies - array of watching cookie's names. Pass empty array if don't want to watch cookies changes.
 * @param options
 * @param options.doNotParse - don't try parse value as JSON
 * @param options.autoUpdateDependencies - automatically update watching dependencies
 * @param cookies - universal-cookie instance
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useCookies(
  dependencies?: string[] | null,
  {
    doNotParse,
    autoUpdateDependencies,
  }?: {
    doNotParse?: boolean | undefined
    autoUpdateDependencies?: boolean | undefined
  },
  cookies?: Cookie,
): {
  /**
   * Reactive get cookie by name. If **autoUpdateDependencies = true** then it will update watching dependencies
   */
  get: <T = any>(name: string, options?: CookieGetOptions | undefined) => T
  /**
   * Reactive get all cookies
   */
  getAll: <T = any>(options?: CookieGetOptions | undefined) => T
  set: (
    name: string,
    value: any,
    options?: CookieSetOptions | undefined,
  ) => void
  remove: (name: string, options?: CookieSetOptions | undefined) => void
  addChangeListener: (callback: CookieChangeListener) => void
  removeChangeListener: (callback: CookieChangeListener) => void
}
```
