---
title: Vue Plugin Best Practices
impact: MEDIUM
impactDescription: Incorrect plugin structure or injection key strategy causes install failures, collisions, and unsafe APIs
type: best-practice
tags: [vue3, plugins, provide-inject, typescript, dependency-injection]
---

# Vue Plugin Best Practices

**Impact: MEDIUM** - Vue plugins should follow the `app.use()` contract, expose explicit capabilities, and use collision-safe injection keys. This keeps plugin setup predictable and composable across large apps.

## Task List

- Export plugins as an object with `install()` or as an install function
- Use the `app` instance in `install()` to register components/directives/provides
- Type plugin APIs with `Plugin` (and options tuple types when needed)
- Use symbol keys (prefer `InjectionKey<T>`) for `provide/inject` in plugins
- Add a small typed composable wrapper for required injections to fail fast

## Structure Plugins for `app.use()`

A Vue plugin must be either:
- An object with `install(app, options?)`
- A function with the same signature

**BAD:**
```ts
const notAPlugin = {
  doSomething() {}
}

app.use(notAPlugin)
```

**GOOD:**
```ts
import type { App } from 'vue'

interface PluginOptions {
  prefix?: string
  debug?: boolean
}

const myPlugin = {
  install(app: App, options: PluginOptions = {}) {
    const { prefix = 'my', debug = false } = options

    if (debug) {
      console.log('Installing myPlugin with prefix:', prefix)
    }

    app.provide('myPlugin', { prefix })
  }
}

app.use(myPlugin, { prefix: 'custom', debug: true })
```

**GOOD:**
```ts
import type { App } from 'vue'

function simplePlugin(app: App, options?: { message: string }) {
  app.config.globalProperties.$greet = () => options?.message ?? 'Hello!'
}

app.use(simplePlugin, { message: 'Welcome!' })
```

## Register Capabilities Explicitly in `install()`

Inside `install()`, wire behavior through Vue application APIs:
- `app.component()` for global components
- `app.directive()` for global directives
- `app.provide()` for injectable services and config
- `app.config.globalProperties` for optional global helpers (sparingly)

**BAD:**
```ts
const uselessPlugin = {
  install(app, options) {
    const service = createService(options)
  }
}
```

**GOOD:**
```ts
const usefulPlugin = {
  install(app, options) {
    const service = createService(options)
    app.provide(serviceKey, service)
  }
}
```

## Type Plugin Contracts

Use Vue's `Plugin` type to keep install signatures and options type-safe.

```ts
import type { App, Plugin } from 'vue'

interface MyOptions {
  apiKey: string
}

const myPlugin: Plugin<[MyOptions]> = {
  install(app: App, options: MyOptions) {
    app.provide(apiKeyKey, options.apiKey)
  }
}
```

## Use Symbol Injection Keys in Plugins

String keys can collide (`'http'`, `'config'`, `'i18n'`). Use symbol keys with `InjectionKey<T>` so injections are unique and typed.

**BAD:**
```ts
export default {
  install(app) {
    app.provide('http', axios)
    app.provide('config', appConfig)
  }
}
```

**GOOD:**
```ts
import type { InjectionKey } from 'vue'
import type { AxiosInstance } from 'axios'

interface AppConfig {
  apiUrl: string
  timeout: number
}

export const httpKey: InjectionKey<AxiosInstance> = Symbol('http')
export const configKey: InjectionKey<AppConfig> = Symbol('appConfig')

export default {
  install(app) {
    app.provide(httpKey, axios)
    app.provide(configKey, { apiUrl: '/api', timeout: 5000 })
  }
}
```

## Provide Required Injection Helpers

Wrap required injections in composables that throw clear setup errors.

```ts
import { inject } from 'vue'
import { authKey, type AuthService } from '@/injection-keys'

export function useAuth(): AuthService {
  const auth = inject(authKey)
  if (!auth) {
    throw new Error('Auth plugin not installed. Did you forget app.use(authPlugin)?')
  }
  return auth
}
```
