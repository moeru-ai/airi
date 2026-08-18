---
category: Browser
---

# useScriptTag

Creates a script tag, with support for automatically unloading (deleting) the script tag on unmount.

If a script tag already exists for the given URL, `useScriptTag()` will not create another script tag, but keep in mind that depending on how you use it, `useScriptTag()` might have already loaded then unloaded that particular JS file from a previous call of `useScriptTag()`.

## Usage

```ts
import { useScriptTag } from '@vueuse/core'

useScriptTag(
  'https://player.twitch.tv/js/embed/v1.js',
  // on script tag loaded.
  (el: HTMLScriptElement) => {
    // do something
  },
)
```

The script will be automatically loaded when the component is mounted and removed when the component is unmounted.

## Configuration

Set `manual: true` to have manual control over the timing to load the script.

```ts
import { useScriptTag } from '@vueuse/core'

const { scriptTag, load, unload } = useScriptTag(
  'https://player.twitch.tv/js/embed/v1.js',
  () => {
    // do something
  },
  { manual: true },
)

// manual controls
await load()
await unload()
```

## Type Declarations

```ts
export interface UseScriptTagOptions extends ConfigurableDocument {
  /**
   * Load the script immediately
   *
   * @default true
   */
  immediate?: boolean
  /**
   * Add `async` attribute to the script tag
   *
   * @default true
   */
  async?: boolean
  /**
   * Script type
   *
   * @default 'text/javascript'
   */
  type?: string
  /**
   * Manual controls the timing of loading and unloading
   *
   * @default false
   */
  manual?: boolean
  crossOrigin?: "anonymous" | "use-credentials"
  referrerPolicy?:
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url"
  noModule?: boolean
  defer?: boolean
  /**
   * Add custom attribute to the script tag
   *
   */
  attrs?: Record<string, string>
  /**
   * Nonce value for CSP (Content Security Policy)
   * @default undefined
   */
  nonce?: string
}
export interface UseScriptTagReturn {
  scriptTag: ShallowRef<HTMLScriptElement | null>
  load: (waitForScriptLoad?: boolean) => Promise<HTMLScriptElement | boolean>
  unload: () => void
}
/**
 * Async script tag loading.
 *
 * @see https://vueuse.org/useScriptTag
 * @param src
 * @param onLoaded
 * @param options
 */
export declare function useScriptTag(
  src: MaybeRefOrGetter<string>,
  onLoaded?: (el: HTMLScriptElement) => void,
  options?: UseScriptTagOptions,
): UseScriptTagReturn
```
