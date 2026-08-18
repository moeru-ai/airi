---
name: plugins
description: Extend stores with custom properties, methods, and behavior
---

# Plugins

Plugins extend all stores with custom properties, methods, or behavior.

## Basic Plugin

```ts
import { createPinia } from 'pinia'

function SecretPiniaPlugin() {
  return { secret: 'the cake is a lie' }
}

const pinia = createPinia()
pinia.use(SecretPiniaPlugin)

// In any store
const store = useStore()
store.secret // 'the cake is a lie'
```

## Plugin Context

Plugins receive a context object:

```ts
import { PiniaPluginContext } from 'pinia'

export function myPiniaPlugin(context: PiniaPluginContext) {
  context.pinia   // pinia instance
  context.app     // Vue app instance
  context.store   // store being augmented
  context.options // store definition options
}
```

## Adding Properties

Return an object to add properties (tracked in devtools):

```ts
pinia.use(() => ({ hello: 'world' }))
```

Or set directly on store:

```ts
pinia.use(({ store }) => {
  store.hello = 'world'
  // For devtools visibility in dev mode
  if (process.env.NODE_ENV === 'development') {
    store._customProperties.add('hello')
  }
})
```

## Adding State

Add to both `store` and `store.$state` for SSR/devtools:

```ts
import { toRef, ref } from 'vue'

pinia.use(({ store }) => {
  if (!store.$state.hasOwnProperty('hasError')) {
    const hasError = ref(false)
    store.$state.hasError = hasError
  }
  store.hasError = toRef(store.$state, 'hasError')
})
```

## Adding External Properties

Wrap non-reactive objects with `markRaw()`:

```ts
import { markRaw } from 'vue'
import { router } from './router'

pinia.use(({ store }) => {
  store.router = markRaw(router)
})
```

## Custom Store Options

Define custom options consumed by plugins:

```ts
// Store definition
defineStore('search', {
  actions: {
    searchContacts() { /* ... */ },
  },
  debounce: {
    searchContacts: 300,
  },
})

// Plugin reads custom option
import debounce from 'lodash/debounce'

pinia.use(({ options, store }) => {
  if (options.debounce) {
    return Object.keys(options.debounce).reduce((acc, action) => {
      acc[action] = debounce(store[action], options.debounce[action])
      return acc
    }, {})
  }
})
```

For Setup Stores, pass options as third argument:

```ts
defineStore(
  'search',
  () => { /* ... */ },
  {
    debounce: { searchContacts: 300 },
  }
)
```

## TypeScript Augmentation

### Custom Properties

```ts
import 'pinia'
import type { Router } from 'vue-router'

declare module 'pinia' {
  export interface PiniaCustomProperties {
    router: Router
    hello: string
  }
}
```

### Custom State

```ts
declare module 'pinia' {
  export interface PiniaCustomStateProperties<S> {
    hasError: boolean
  }
}
```

### Custom Options

```ts
declare module 'pinia' {
  export interface DefineStoreOptionsBase<S, Store> {
    debounce?: Partial<Record<keyof StoreActions<Store>, number>>
  }
}
```

## Subscribe in Plugins

```ts
pinia.use(({ store }) => {
  store.$subscribe(() => {
    // React to state changes
  })
  store.$onAction(() => {
    // React to actions
  })
})
```

## Nuxt Plugin

Create a Nuxt plugin to add Pinia plugins:

```ts
// plugins/myPiniaPlugin.ts
import { PiniaPluginContext } from 'pinia'

function MyPiniaPlugin({ store }: PiniaPluginContext) {
  store.$subscribe((mutation) => {
    console.log(`[🍍 ${mutation.storeId}]: ${mutation.type}`)
  })
  return { creationTime: new Date() }
}

export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(MyPiniaPlugin)
})
```

<!--
Source references:
- https://pinia.vuejs.org/core-concepts/plugins.html
-->
