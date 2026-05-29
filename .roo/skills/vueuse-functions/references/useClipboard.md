---
category: Browser
---

# useClipboard

Reactive [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API). Provides the ability to respond to clipboard commands (cut, copy, and paste) as well as to asynchronously read from and write to the system clipboard. Access to the contents of the clipboard is gated behind the [Permissions API](https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API). Without user permission, reading or altering the clipboard contents is not permitted.

<CourseLink href="https://vueschool.io/lessons/reactive-browser-wrappers-in-vueuse-useclipboard?friend=vueuse">Learn how to reactively save text to the clipboard with this FREE video lesson from Vue School!</CourseLink>

## Usage

```vue
<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

const source = ref('Hello')
const { text, copy, copied, isSupported } = useClipboard({ source })
</script>

<template>
  <div v-if="isSupported">
    <button @click="copy(source)">
      <!-- by default, `copied` will be reset in 1.5s -->
      <span v-if="!copied">Copy</span>
      <span v-else>Copied!</span>
    </button>
    <p>Current copied: <code>{{ text || 'none' }}</code></p>
  </div>
  <p v-else>
    Your browser does not support Clipboard API
  </p>
</template>
```

### Options

| Option         | Type                       | Default | Description                                                       |
| -------------- | -------------------------- | ------- | ----------------------------------------------------------------- |
| `source`       | `MaybeRefOrGetter<string>` | —       | Default content to copy when `copy()` is called without arguments |
| `read`         | `boolean`                  | `false` | Enable reading clipboard content on copy/cut events               |
| `copiedDuring` | `number`                   | `1500`  | Milliseconds before `copied` resets to `false`                    |
| `legacy`       | `boolean`                  | `false` | Fallback to `document.execCommand` if Clipboard API unavailable   |

### Return Values

| Property      | Type                               | Description                                       |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| `isSupported` | `ComputedRef<boolean>`             | Whether clipboard is supported (native or legacy) |
| `text`        | `Ref<string>`                      | Current clipboard content (when `read: true`)     |
| `copied`      | `Ref<boolean>`                     | `true` after successful copy, auto-resets         |
| `copy`        | `(text?: string) => Promise<void>` | Copy text to clipboard                            |

### Legacy Mode

Set `legacy: true` to keep the ability to copy if [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) is not available. It will handle copy with [execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) as fallback.

```ts
const { copy, isSupported } = useClipboard({ legacy: true })
```

## Component Usage

```vue
<template>
  <UseClipboard v-slot="{ copy, copied }" source="copy me">
    <button @click="copy()">
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </UseClipboard>
</template>
```

## Type Declarations

```ts
export interface UseClipboardOptions<Source> extends ConfigurableNavigator {
  /**
   * Enabled reading for clipboard
   *
   * @default false
   */
  read?: boolean
  /**
   * Copy source
   */
  source?: Source
  /**
   * Milliseconds to reset state of `copied` ref
   *
   * @default 1500
   */
  copiedDuring?: number
  /**
   * Whether fallback to document.execCommand('copy') if clipboard is undefined.
   *
   * @default false
   */
  legacy?: boolean
}
export interface UseClipboardReturn<Optional> extends Supportable {
  text: Readonly<ShallowRef<string>>
  copied: Readonly<ShallowRef<boolean>>
  copy: Optional extends true
    ? (text?: string) => Promise<void>
    : (text: string) => Promise<void>
}
/**
 * Reactive Clipboard API.
 *
 * @see https://vueuse.org/useClipboard
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export declare function useClipboard(
  options?: UseClipboardOptions<undefined>,
): UseClipboardReturn<false>
export declare function useClipboard(
  options: UseClipboardOptions<MaybeRefOrGetter<string>>,
): UseClipboardReturn<true>
```
